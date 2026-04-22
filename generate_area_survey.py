"""
FH2 Area Survey Route Generator v2 — RocketDNA
================================================
Generates DJI FlightHub 2 compatible KMZ area survey routes from KML polygons.

Modes: Ortho | Ortho+SmartOblique | Oblique(5-pass) | Oblique+SmartOblique
Heights: ASL | ALT | AGL (pre-planned + RTTF)
Terrain: DSM GeoTIFF for terrain-adjusted waypoints

Usage:
  python generate_area_survey.py                          # Launch GUI
  python generate_area_survey.py --kml poly.kml -o out.kmz --altitude 200 --course 270

Dependencies: numpy pyproj shapely rasterio matplotlib
"""
import math, os, sys, zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, LineString
from shapely.affinity import translate as sh_translate

try:
    import rasterio; from rasterio.transform import rowcol; HAS_RIO = True
except ImportError: HAS_RIO = False
try:
    import matplotlib
    matplotlib.use("Agg")  # Safe default; GUI code switches to TkAgg at runtime
    import matplotlib.pyplot as plt; HAS_MPL = True
except: HAS_MPL = False

# ══════════════════════════════════════════════════════════════════════
@dataclass
class Cam:
    name:str; sw:float; sh:float; fl:float; iw:int; ih:int
    drone_e:int; drone_se:int; pay_e:int; pay_se:int

CAMS = {
    "M4D Wide (24mm)": Cam("M4D Wide (24mm)", 9.6,7.2,6.72,5280,3956,100,0,98,0),
    "M4E Wide (24mm)": Cam("M4E Wide (24mm)", 9.6,7.2,6.72,5280,3956,100,0,98,0),
}

@dataclass
class SP:
    alt:float=120; hm:str="AGL"; tf:bool=False; rttf:bool=False
    coll:str="ortho"; so:bool=False; so_pitch:float=30; ob_pitch:float=-45
    fov:float=80; sov:float=70; course:float=0; speed:float=12; margin:float=0
    shoot:str="distance"; elev_opt:bool=True
    toff_h:float=120; rth_h:float=100; tspd:float=15; finish:str="goHome"
    gz:bool=True; bypass:bool=True; dsm:Optional[str]=None; ti:float=100
    gsd_ov:Optional[float]=None; cam_key:str="M4D Wide (24mm)"

# ══════════════════════════════════════════════════════════════════════
def gsd(a,c): return (c.sw*a)/(c.fl*c.iw)*100
def footprint(a,c): return (c.sw*a)/(c.fl*c.iw)*c.iw, (c.sh*a)/(c.fl*c.ih)*c.ih
def line_sp(a,s,c): w,_=footprint(a,c); return w*(1-s/100)
def photo_iv(a,f,c): _,h=footprint(a,c); return h*(1-f/100)
def alt_gsd(g,c): return (g/100*c.fl*c.iw)/c.sw
def det_epsg(lo,la):
    if 108<=lo<156 and -45<=la<=-10:
        z=int((lo-108)/6)+49; return 7800+z, f"GDA2020 MGA Z{z}"
    z=int((lo+180)/6)+1
    return (32600+z,f"UTM {z}N") if la>=0 else (32700+z,f"UTM {z}S")

def gen_lines(poly_ll, bearing, spacing, epsg, off_m=0, off_bear=0):
    tf_t=Transformer.from_crs("EPSG:4326",f"EPSG:{epsg}",always_xy=True)
    tf_b=Transformer.from_crs(f"EPSG:{epsg}","EPSG:4326",always_xy=True)
    pp=np.array([tf_t.transform(lo,la) for lo,la in poly_ll])
    poly=Polygon(pp)
    if off_m:
        dx=off_m*math.sin(math.radians(off_bear))
        dy=off_m*math.cos(math.radians(off_bear))
        poly=sh_translate(poly,xoff=dx,yoff=dy)
    if poly.is_empty: return []
    cx,cy=poly.centroid.x,poly.centroid.y
    a=math.radians(bearing-90); ca,sa=math.cos(a),math.sin(a)
    def r(x,y): dx,dy=x-cx,y-cy; return cx+dx*ca-dy*sa,cy+dx*sa+dy*ca
    def rb(x,y):
        cb,sb=math.cos(-a),math.sin(-a); dx,dy=x-cx,y-cy
        return cx+dx*cb-dy*sb,cy+dx*sb+dy*cb
    rp=Polygon([r(x,y) for x,y in poly.exterior.coords])
    mx,my,Mx,My=rp.bounds; mx-=spacing; Mx+=spacing
    lines=[]; y=my+spacing/2
    while y<=My:
        seg=LineString([(mx,y),(Mx,y)]); inter=rp.intersection(seg)
        if not inter.is_empty:
            ss=[inter] if inter.geom_type=="LineString" else \
               list(inter.geoms) if inter.geom_type=="MultiLineString" else []
            for s in ss:
                if s.length>0:
                    pts=[rb(x,y) for x,y in s.coords]
                    lines.append(np.array([tf_b.transform(x,y) for x,y in pts]))
        y+=spacing
    for i in range(1,len(lines),2): lines[i]=lines[i][::-1]
    return lines

def add_terr_wps(lines, iv, epsg):
    tf_t=Transformer.from_crs("EPSG:4326",f"EPSG:{epsg}",always_xy=True)
    tf_b=Transformer.from_crs(f"EPSG:{epsg}","EPSG:4326",always_xy=True)
    res=[]
    for ln in lines:
        pp=np.array([tf_t.transform(lo,la) for lo,la in ln]); new=[pp[0]]
        for i in range(len(pp)-1):
            p1,p2=pp[i],pp[i+1]; d=np.linalg.norm(p2-p1)
            if d>iv:
                n=int(math.ceil(d/iv))
                for j in range(1,n): new.append(p1+(j/n)*(p2-p1))
            new.append(p2)
        res.append(np.array([tf_b.transform(x,y) for x,y in new]))
    return res

# ══════════════════════════════════════════════════════════════════════
def sample_dsm(path, pts):
    with rasterio.open(path) as ds:
        tf=Transformer.from_crs("EPSG:4326",ds.crs,always_xy=True); ev=np.zeros(len(pts))
        for i,(lo,la) in enumerate(pts):
            x,y=tf.transform(lo,la); r,c=rowcol(ds.transform,x,y)
            r=max(0,min(r,ds.height-1)); c=max(0,min(c,ds.width-1))
            v=ds.read(1,window=rasterio.windows.Window(c,r,1,1))[0,0]
            ev[i]=float(v) if v!=ds.nodata and not np.isnan(v) else 0
    return ev

def geoid_n(lo,la):
    try:
        tf=Transformer.from_crs("EPSG:4326+5773","EPSG:4979",always_xy=True)
        _,_,h=tf.transform(lo,la,0.0); return h
    except: return -32.0 if(108<=lo<=156 and -45<=la<=-10) else 0

def dsm2ell(ev,pts,dat="AHD"):
    if dat.lower()=="ellipsoidal": return ev.copy()
    return np.array([e+geoid_n(lo,la) for e,(lo,la) in zip(ev,pts)])

def parse_kml(path):
    import xml.etree.ElementTree as ET
    p=Path(path)
    if p.suffix.lower()==".kmz":
        with zipfile.ZipFile(p) as z:
            ns=[n for n in z.namelist() if n.endswith(".kml")]; xb=z.read(ns[0])
    else: xb=p.read_bytes()
    root=ET.fromstring(xb)
    for e in root.iter():
        t=e.tag.split("}")[-1] if "}" in e.tag else e.tag
        if t=="coordinates" and e.text and e.text.strip():
            pts=[]
            for part in e.text.strip().split():
                v=part.split(",")
                if len(v)>=2: pts.append((float(v[0]),float(v[1])))
            if len(pts)>=3: return np.array(pts)
    raise ValueError("No polygon in KML/KMZ")

# ══════════════════════════════════════════════════════════════════════
PC={"nadir":"#3b82f6","ob_e":"#f97316","ob_s":"#10b981","ob_w":"#ef4444","ob_n":"#a855f7","smart":"#06b6d4"}

def viz_survey(poly, passes, p, stats, show=True, save=None):
    print(f"[VIZ] Starting visualization (show={show}, save={save})")
    print(f"[VIZ] HAS_MPL={HAS_MPL}")
    if not HAS_MPL:
        print("[VIZ] matplotlib not available — skipping"); return
    print(f"[VIZ] Current backend: {matplotlib.get_backend()}")
    if show:
        try:
            plt.switch_backend("TkAgg")
            print(f"[VIZ] Switched to TkAgg backend")
        except Exception as e:
            print(f"[VIZ] WARNING: Could not switch to TkAgg: {e}")
    print(f"[VIZ] Active backend: {matplotlib.get_backend()}")
    print(f"[VIZ] Drawing {len(passes)} pass(es), polygon with {len(poly)} vertices")
    fig,ax=plt.subplots(1,1,figsize=(10,8),facecolor="#1a1a2e"); ax.set_facecolor("#0f0f23")
    pc=np.vstack([poly,poly[0:1]])
    ax.plot(pc[:,0],pc[:,1],'-',color="#fff",lw=2,label="Survey Area",zorder=5)
    ax.fill(poly[:,0],poly[:,1],alpha=0.08,color="#3b82f6")
    for ps in passes:
        shown=False
        for ln in ps["lines"]:
            ax.plot(ln[:,0],ln[:,1],'-',color=ps["color"],lw=1.2,alpha=0.85,
                   label=ps["label"] if not shown else None,zorder=3); shown=True
            m=len(ln)//2
            if 0<m<len(ln)-1:
                ax.annotate("",xy=(ln[m+1,0],ln[m+1,1]),xytext=(ln[m,0],ln[m,1]),
                           arrowprops=dict(arrowstyle="->",color=ps["color"],lw=1.5),zorder=4)
            ax.scatter(ln[:,0],ln[:,1],s=8,color=ps["color"],zorder=6,edgecolors="none")
    st=(f"GSD: {stats.get('gsd_cm',0):.2f} cm/px | Lines: {stats.get('n_lines',0)}\n"
        f"WPs: {stats.get('n_waypoints',0)} | Dist: {stats.get('total_distance_m',0):.0f}m\n"
        f"Time: {stats.get('duration_min',0):.1f}min | Photos: ~{stats.get('n_photos_est',0)}\n"
        f"Spacing: {stats.get('line_spacing_m',0):.1f}m | Interval: {stats.get('photo_interval_m',0):.1f}m")
    ax.text(0.02,0.98,st,transform=ax.transAxes,fontsize=8,va='top',fontfamily='monospace',
           color="#e0e0e0",bbox=dict(boxstyle='round,pad=0.5',facecolor='#1a1a2e',edgecolor='#3b82f6',alpha=0.9))
    md=p.coll.title()+(" + Smart Oblique" if p.so else "")
    ax.set_title(f"FH2 Survey: {md} | {p.course}° | {p.alt}m {p.hm}",color="#e0e0e0",fontsize=11,fontweight="bold")
    ax.set_xlabel("Longitude",color="#888",fontsize=9); ax.set_ylabel("Latitude",color="#888",fontsize=9)
    ax.tick_params(colors="#888",labelsize=8)
    for s in ax.spines.values(): s.set_color("#333")
    ax.legend(loc="lower right",fontsize=8,facecolor="#1a1a2e",edgecolor="#333",labelcolor="#e0e0e0")
    ax.set_aspect("equal"); plt.tight_layout()
    if save:
        fig.savefig(save,dpi=150,facecolor=fig.get_facecolor())
        print(f"[VIZ] Saved preview to {save}")
    if show:
        print(f"[VIZ] Calling plt.show() with backend={matplotlib.get_backend()}")
        try:
            plt.show()
            print("[VIZ] plt.show() returned")
        except Exception as e:
            print(f"[VIZ] plt.show() failed: {e}")
            # Fallback: save to temp and open with OS
            import tempfile, subprocess
            tmp=os.path.join(tempfile.gettempdir(),"fh2_survey_preview.png")
            fig.savefig(tmp,dpi=150,facecolor=fig.get_facecolor())
            print(f"[VIZ] Saved fallback to {tmp}, opening with OS viewer")
            if sys.platform=="win32": os.startfile(tmp)
            elif sys.platform=="darwin": subprocess.run(["open",tmp])
            else: subprocess.run(["xdg-open",tmp])
    plt.close(fig)
    print("[VIZ] Done")
    return fig

# ══════════════════════════════════════════════════════════════════════
# XML BUILDERS
# ══════════════════════════════════════════════════════════════════════
def _cs(poly): return "\n".join(f"                {lo:.12f},{la:.12f},0" for lo,la in poly)
def _hd(a,b,c,d):
    dl=math.radians(c-a); l1,l2=math.radians(b),math.radians(d)
    x=math.sin(dl)*math.cos(l2); y=math.cos(l1)*math.sin(l2)-math.sin(l1)*math.cos(l2)*math.cos(dl)
    return math.degrees(math.atan2(x,y))%360
def _dm(a,b,c,d):
    R=6371000; dl=math.radians(d-b); dn=math.radians(c-a)
    aa=math.sin(dl/2)**2+math.cos(math.radians(b))*math.cos(math.radians(d))*math.sin(dn/2)**2
    return R*2*math.atan2(math.sqrt(aa),math.sqrt(1-aa))

def build_tmpl(poly,p,c):
    hm_m={"ALT":"relativeToStartPoint","ASL":"EGM96","AGL":"realTimeFollowSurface" if p.rttf else "EGM96"}
    sf=""
    if p.hm=="AGL":
        rt=1 if p.rttf else 0
        sf=f'\n        <wpml:surfaceFollowModeEnable>1</wpml:surfaceFollowModeEnable>\n        <wpml:isRealtimeSurfaceFollow>{rt}</wpml:isRealtimeSurfaceFollow>\n        <wpml:surfaceRelativeHeight>{p.alt}</wpml:surfaceRelativeHeight>'
    soe=1 if(p.coll=="oblique" and p.so) else 0
    qom=1 if(p.so and p.coll=="ortho") else 0
    sop=f'\n        <wpml:quickOrthoMappingPitch>{p.so_pitch}</wpml:quickOrthoMappingPitch>' if qom else ""
    obp=f'\n        <wpml:smartObliqueGimbalPitch>{p.ob_pitch}</wpml:smartObliqueGimbalPitch>' if(p.coll=="oblique" and p.so) else ""
    gz=1 if p.gz else 0; rr=1 if p.bypass else 0
    ts=int(np.datetime64('now','ms').astype(np.int64))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:author>RocketDNA Survey Generator</wpml:author>
    <wpml:createTime>{ts}</wpml:createTime><wpml:updateTime>{ts}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode>
      <wpml:finishAction>{p.finish}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>{p.toff_h}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>{p.tspd}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>{p.rth_h}</wpml:globalRTHHeight>
      <wpml:droneInfo><wpml:droneEnumValue>{c.drone_e}</wpml:droneEnumValue><wpml:droneSubEnumValue>{c.drone_se}</wpml:droneSubEnumValue></wpml:droneInfo>
      <wpml:autoRerouteInfo><wpml:transitionalAutoRerouteMode>{rr}</wpml:transitionalAutoRerouteMode><wpml:missionAutoRerouteMode>{rr}</wpml:missionAutoRerouteMode></wpml:autoRerouteInfo>
      <wpml:waylineAvoidLimitAreaMode>{gz}</wpml:waylineAvoidLimitAreaMode>
      <wpml:payloadInfo><wpml:payloadEnumValue>{c.pay_e}</wpml:payloadEnumValue><wpml:payloadSubEnumValue>{c.pay_se}</wpml:payloadSubEnumValue><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>mapping2d</wpml:templateType><wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode><wpml:heightMode>{hm_m[p.hm]}</wpml:heightMode>
        <wpml:globalShootHeight>{p.alt}</wpml:globalShootHeight>{sf}
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>{p.speed}</wpml:autoFlightSpeed>
      <Placemark>
        <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
        <wpml:elevationOptimizeEnable>{1 if p.elev_opt else 0}</wpml:elevationOptimizeEnable>
        <wpml:smartObliqueEnable>{soe}</wpml:smartObliqueEnable>
        <wpml:quickOrthoMappingEnable>{qom}</wpml:quickOrthoMappingEnable>
        <wpml:facadeWaylineEnable>0</wpml:facadeWaylineEnable>
        <wpml:isLookAtSceneSet>0</wpml:isLookAtSceneSet>{sop}{obp}
        <wpml:shootType>{p.shoot}</wpml:shootType>
        <wpml:direction>{p.course}</wpml:direction><wpml:margin>{p.margin}</wpml:margin>
        <wpml:efficiencyFlightModeEnable>0</wpml:efficiencyFlightModeEnable>
        <wpml:doubleGridWaylineEnable>0</wpml:doubleGridWaylineEnable>
        <wpml:overlap>
          <wpml:orthoCameraOverlapH>{p.fov}</wpml:orthoCameraOverlapH><wpml:orthoCameraOverlapW>{p.sov}</wpml:orthoCameraOverlapW>
          <wpml:inclinedCameraOverlapH>{p.fov}</wpml:inclinedCameraOverlapH><wpml:inclinedCameraOverlapW>{p.sov}</wpml:inclinedCameraOverlapW>
        </wpml:overlap>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
{_cs(poly)}
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
        <wpml:ellipsoidHeight>{p.alt}</wpml:ellipsoidHeight><wpml:height>{p.alt}</wpml:height>
      </Placemark>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex><wpml:focusMode>firstPoint</wpml:focusMode>
        <wpml:meteringMode>average</wpml:meteringMode><wpml:returnMode>singleReturnStrongest</wpml:returnMode>
        <wpml:samplingRate>240000</wpml:samplingRate><wpml:scanningMode>repetitive</wpml:scanningMode>
        <wpml:imageFormat>visable</wpml:imageFormat><wpml:photoSize>default_l</wpml:photoSize>
      </wpml:payloadParam>
    </Folder>
  </Document>
</kml>'''

def _sag(pitch=-90):
    return f'''      <wpml:startActionGroup>
        <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam><wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase><wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable><wpml:gimbalPitchRotateAngle>{pitch}</wpml:gimbalPitchRotateAngle>
            <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable><wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
            <wpml:gimbalYawRotateEnable>1</wpml:gimbalYawRotateEnable><wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
            <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable><wpml:gimbalRotateTime>10</wpml:gimbalRotateTime>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>1</wpml:actionId><wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:hoverTime>0.5</wpml:hoverTime></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>2</wpml:actionId><wpml:actionActuatorFunc>setFocusType</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:cameraFocusType>manual</wpml:cameraFocusType><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>3</wpml:actionId><wpml:actionActuatorFunc>focus</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:focusX>0</wpml:focusX><wpml:focusY>0</wpml:focusY><wpml:focusRegionWidth>0</wpml:focusRegionWidth><wpml:focusRegionHeight>0</wpml:focusRegionHeight><wpml:isPointFocus>0</wpml:isPointFocus><wpml:isInfiniteFocus>1</wpml:isInfiniteFocus><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex><wpml:isCalibrationFocus>0</wpml:isCalibrationFocus></wpml:actionActuatorFuncParam></wpml:action>
        <wpml:action><wpml:actionId>4</wpml:actionId><wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:hoverTime>1</wpml:hoverTime></wpml:actionActuatorFuncParam></wpml:action>
      </wpml:startActionGroup>'''

def _ag_dist(gid,s,e,iv,pitch):
    return f'''        <wpml:actionGroup><wpml:actionGroupId>{gid}</wpml:actionGroupId><wpml:actionGroupStartIndex>{s}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>{e}</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>betweenAdjacentPoints</wpml:actionTriggerType></wpml:actionTrigger>
          <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>gimbalAngleLock</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>
        <wpml:actionGroup><wpml:actionGroupId>{gid+1}</wpml:actionGroupId><wpml:actionGroupStartIndex>{s}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>{e}</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>multipleDistance</wpml:actionTriggerType><wpml:actionTriggerParam>{iv}</wpml:actionTriggerParam></wpml:actionTrigger>
          <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase><wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode><wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable><wpml:gimbalPitchRotateAngle>{pitch}</wpml:gimbalPitchRotateAngle><wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable><wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle><wpml:gimbalYawRotateEnable>1</wpml:gimbalYawRotateEnable><wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle><wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable><wpml:gimbalRotateTime>10</wpml:gimbalRotateTime><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action>
          <wpml:action><wpml:actionId>1</wpml:actionId><wpml:actionActuatorFunc>startContinuousShooting</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex><wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex><wpml:payloadLensIndex>visable</wpml:payloadLensIndex></wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>'''

def _ag_so_start(gid,s,e):
    return f'''        <wpml:actionGroup><wpml:actionGroupId>{gid}</wpml:actionGroupId><wpml:actionGroupStartIndex>{s}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>{e}</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>betweenAdjacentPoints</wpml:actionTriggerType></wpml:actionTrigger>
          <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>gimbalAngleLock</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action>
          <wpml:action><wpml:actionId>1</wpml:actionId><wpml:actionActuatorFunc>startSmartOblique</wpml:actionActuatorFunc></wpml:action></wpml:actionGroup>'''

def _ag_so_stop(gid,i):
    return f'''        <wpml:actionGroup><wpml:actionGroupId>{gid}</wpml:actionGroupId><wpml:actionGroupStartIndex>{i}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>{i}</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>
          <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>stopSmartOblique</wpml:actionActuatorFunc></wpml:action>
          <wpml:action><wpml:actionId>1</wpml:actionId><wpml:actionActuatorFunc>gimbalAngleUnlock</wpml:actionActuatorFunc></wpml:action></wpml:actionGroup>'''

def _ag_stop(gid,i):
    return f'''        <wpml:actionGroup><wpml:actionGroupId>{gid}</wpml:actionGroupId><wpml:actionGroupStartIndex>{i}</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>{i}</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>
          <wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>stopContinuousShooting</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex><wpml:payloadLensIndex>visable</wpml:payloadLensIndex></wpml:actionActuatorFuncParam></wpml:action>
          <wpml:action><wpml:actionId>1</wpml:actionId><wpml:actionActuatorFunc>gimbalAngleUnlock</wpml:actionActuatorFunc></wpml:action></wpml:actionGroup>'''

def _wp(i,lo,la,h,sp,tm,td,hdg,ag=""):
    return f'''      <Placemark><Point><coordinates>{lo:.12f},{la:.12f}</coordinates></Point>
        <wpml:index>{i}</wpml:index><wpml:executeHeight>{h}</wpml:executeHeight><wpml:waypointSpeed>{sp}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode><wpml:waypointHeadingAngle>{hdg}</wpml:waypointHeadingAngle><wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint><wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode></wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>{tm}</wpml:waypointTurnMode><wpml:waypointTurnDampingDist>{td}</wpml:waypointTurnDampingDist></wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
{ag}      </Placemark>'''

def build_std_wl(wps,spd,iv,pitch,wl_id):
    n=len(wps); gid=0; wxs=[]
    for i,(lo,la,h) in enumerate(wps):
        ep=(i==0 or i==n-1)
        hdg=_hd(lo,la,wps[i+1][0],wps[i+1][1]) if i<n-1 else _hd(wps[i-1][0],wps[i-1][1],lo,la) if i>0 else 0
        tm,td=("toPointAndStopWithDiscontinuityCurvature",0) if ep else ("coordinateTurn",10)
        ag=""
        if i==0: ag=_ag_dist(gid,0,n-1,iv,pitch)+"\n"; gid+=2
        if i==n-1: ag+=_ag_stop(gid,i)+"\n"; gid+=1
        wxs.append(_wp(i,lo,la,h,spd,tm,td,hdg,ag))
    d=sum(_dm(wps[i][0],wps[i][1],wps[i+1][0],wps[i+1][1]) for i in range(n-1))
    return f'''    <Folder>
      <wpml:templateId>0</wpml:templateId><wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>{wl_id}</wpml:waylineId><wpml:distance>{d:.6f}</wpml:distance><wpml:duration>{d/spd:.6f}</wpml:duration>
      <wpml:autoFlightSpeed>{spd}</wpml:autoFlightSpeed>
{_sag(pitch)}
      <wpml:realTimeFollowSurfaceByFov>0</wpml:realTimeFollowSurfaceByFov>
{"".join(wxs)}
    </Folder>''', d

def build_so_wl(wps,bounds,spd,wl_id):
    n=len(wps); gid=0; wxs=[]
    for i,(lo,la,h) in enumerate(wps):
        ls=any(s==i for s,e in bounds); le=any(e==i for s,e in bounds)
        ep=(i==0 or i==n-1)
        hdg=_hd(lo,la,wps[i+1][0],wps[i+1][1]) if i<n-1 else _hd(wps[i-1][0],wps[i-1][1],lo,la) if i>0 else 0
        if ep: tm,td="toPointAndStopWithDiscontinuityCurvature",0
        elif le: tm,td="toPointAndPassWithContinuityCurvature",10
        else: tm,td="coordinateTurn",10
        ag=""
        if ls:
            ei=next(e for s,e in bounds if s==i)
            ag+=_ag_so_start(gid,i,ei)+"\n"; gid+=1
        if le: ag+=_ag_so_stop(gid,i)+"\n"; gid+=1
        wxs.append(_wp(i,lo,la,h,spd,tm,td,hdg,ag))
    d=sum(_dm(wps[i][0],wps[i][1],wps[i+1][0],wps[i+1][1]) for i in range(n-1))
    return f'''    <Folder>
      <wpml:templateId>0</wpml:templateId><wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>{wl_id}</wpml:waylineId><wpml:distance>{d:.6f}</wpml:distance><wpml:duration>{d/spd:.6f}</wpml:duration>
      <wpml:autoFlightSpeed>{spd}</wpml:autoFlightSpeed>
{_sag(-90)}
      <wpml:realTimeFollowSurfaceByFov>0</wpml:realTimeFollowSurfaceByFov>
{"".join(wxs)}
    </Folder>''', d

def wrap_wpml(folders,p,c):
    gz=1 if p.gz else 0; rr=1 if p.bypass else 0
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>pointToPoint</wpml:flyToWaylineMode><wpml:finishAction>{p.finish}</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost><wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>{p.toff_h}</wpml:takeOffSecurityHeight><wpml:globalTransitionalSpeed>{p.tspd}</wpml:globalTransitionalSpeed><wpml:globalRTHHeight>{p.rth_h}</wpml:globalRTHHeight>
      <wpml:droneInfo><wpml:droneEnumValue>{c.drone_e}</wpml:droneEnumValue><wpml:droneSubEnumValue>{c.drone_se}</wpml:droneSubEnumValue></wpml:droneInfo>
      <wpml:autoRerouteInfo><wpml:transitionalAutoRerouteMode>{rr}</wpml:transitionalAutoRerouteMode><wpml:missionAutoRerouteMode>{rr}</wpml:missionAutoRerouteMode></wpml:autoRerouteInfo>
      <wpml:waylineAvoidLimitAreaMode>{gz}</wpml:waylineAvoidLimitAreaMode>
      <wpml:payloadInfo><wpml:payloadEnumValue>{c.pay_e}</wpml:payloadEnumValue><wpml:payloadSubEnumValue>{c.pay_se}</wpml:payloadSubEnumValue><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:payloadInfo>
    </wpml:missionConfig>
{folders}
  </Document>
</kml>'''

# ══════════════════════════════════════════════════════════════════════
def generate(kml,dsm,out,p,dat="AHD",preview=False):
    c=CAMS[p.cam_key]
    if p.gsd_ov: p.alt=alt_gsd(p.gsd_ov,c)
    poly=parse_kml(kml); cx,cy=poly[:,0].mean(),poly[:,1].mean()
    ep,cn=det_epsg(cx,cy); ls_v=line_sp(p.alt,p.sov,c); pi_v=photo_iv(p.alt,p.fov,c)
    ob_off=p.alt/math.tan(math.radians(abs(p.ob_pitch))) if p.ob_pitch!=-90 else 0
    perp=(p.course+90)%360

    def heights(pts):
        if dsm and HAS_RIO:
            raw=sample_dsm(dsm,pts); return dsm2ell(raw,pts,dat)+p.alt
        return np.full(len(pts),p.alt)
    def l2w(lines):
        pts=np.array([pt for ln in lines for pt in ln])
        h=heights(pts); return [(lo,la,hh) for(lo,la),hh in zip(pts,h)]

    viz=[]; fxs=[]; td=0; tw=0; tl=0; wl=0

    if p.coll=="ortho" and not p.so:
        nl=gen_lines(poly,p.course,ls_v,ep)
        if p.elev_opt: nl=add_terr_wps(nl,p.ti,ep)
        w=l2w(nl); f,d=build_std_wl(w,p.speed,pi_v,-90,0); fxs.append(f); td+=d; tw+=len(w); tl+=len(nl)
        viz.append({"label":"Nadir (-90°)","color":PC["nadir"],"lines":nl})

    elif p.coll=="ortho" and p.so:
        nl=gen_lines(poly,p.course,ls_v,ep)
        if p.elev_opt: nl=add_terr_wps(nl,p.ti,ep)
        w=l2w(nl); idx=0; bd=[]
        for ln in nl: bd.append((idx,idx+len(ln)-1)); idx+=len(ln)
        f,d=build_so_wl(w,bd,p.speed,0); fxs.append(f); td+=d; tw+=len(w); tl+=len(nl)
        viz.append({"label":"Nadir+SmartOblique","color":PC["smart"],"lines":nl})

    elif p.coll=="oblique" and not p.so:
        nl=gen_lines(poly,p.course,ls_v,ep)
        if p.elev_opt: nl=add_terr_wps(nl,p.ti,ep)
        w=l2w(nl); f,d=build_std_wl(w,p.speed,pi_v,-90,wl); fxs.append(f); td+=d; tw+=len(w); tl+=len(nl); wl+=1
        viz.append({"label":"Nadir (-90°)","color":PC["nadir"],"lines":nl})
        for lbl,fb,od,clr in [("East oblique",p.course,90,PC["ob_e"]),("South oblique",perp,180,PC["ob_s"]),
                               ("West oblique",p.course,270,PC["ob_w"]),("North oblique",perp,0,PC["ob_n"])]:
            ol=gen_lines(poly,fb,ls_v,ep,ob_off,od)
            if p.elev_opt: ol=add_terr_wps(ol,p.ti,ep)
            if ol:
                w=l2w(ol); f,d=build_std_wl(w,p.speed,pi_v,p.ob_pitch,wl)
                fxs.append(f); td+=d; tw+=len(w); tl+=len(ol); wl+=1
                viz.append({"label":f"{lbl} ({p.ob_pitch}°)","color":clr,"lines":ol})

    elif p.coll=="oblique" and p.so:
        tf_t=Transformer.from_crs("EPSG:4326",f"EPSG:{ep}",always_xy=True)
        tf_b=Transformer.from_crs(f"EPSG:{ep}","EPSG:4326",always_xy=True)
        ext=Polygon([tf_t.transform(lo,la) for lo,la in poly]).buffer(ob_off)
        ec=np.array([tf_b.transform(x,y) for x,y in ext.exterior.coords])
        ol=gen_lines(ec,p.course,ls_v,ep)
        if p.elev_opt: ol=add_terr_wps(ol,p.ti,ep)
        w=l2w(ol); idx=0; bd=[]
        for ln in ol: bd.append((idx,idx+len(ln)-1)); idx+=len(ln)
        f,d=build_so_wl(w,bd,p.speed,0); fxs.append(f); td+=d; tw+=len(w); tl+=len(ol)
        viz.append({"label":"Oblique+Smart","color":PC["smart"],"lines":ol})

    tmpl=build_tmpl(poly,p,c); wpml=wrap_wpml("\n".join(fxs),p,c)
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("wpmz/template.kml",tmpl); z.writestr("wpmz/waylines.wpml",wpml)
        if dsm and p.tf and not p.rttf: z.write(dsm,f"wpmz/res/dsm/{Path(dsm).name}")

    np_est=int(td/pi_v) if pi_v>0 else 0
    stats={"n_lines":tl,"n_waypoints":tw,"total_distance_m":td,"duration_min":td/p.speed/60,
           "n_photos_est":np_est,"line_spacing_m":ls_v,"photo_interval_m":pi_v,
           "gsd_cm":gsd(p.alt,c),"altitude_m":p.alt,"crs":cn,"epsg":ep}
    if preview and HAS_MPL:
        pp=out.replace(".kmz","_preview.png")
        viz_survey(poly,viz,p,stats,show=False,save=pp); stats["preview"]=pp
    return stats,viz

# ══════════════════════════════════════════════════════════════════════
def launch_gui():
    print("══════════════════════════════════════════════════")
    print("  FH2 Area Survey Generator — RocketDNA")
    print("══════════════════════════════════════════════════")
    print(f"  matplotlib:  {'✅ ' + matplotlib.get_backend() if HAS_MPL else '❌ not available'}")
    print(f"  rasterio:    {'✅' if HAS_RIO else '❌ not available (DSM disabled)'}")
    print(f"  cameras:     {', '.join(CAMS.keys())}")
    print("══════════════════════════════════════════════════")
    print("  Run from terminal to see logs. Logs prefixed with")
    print("  [PREVIEW], [GENERATE], [VIZ] will appear here.")
    print("══════════════════════════════════════════════════\n")
    from tkinter import (Tk,ttk,filedialog,messagebox,StringVar,DoubleVar,IntVar,BooleanVar,
                         Label,Entry,Button,Frame,LabelFrame,Checkbutton,LEFT,RIGHT,W,E,BOTH,X,Y,GROOVE,Canvas,Scrollbar)
    root=Tk(); root.title("FH2 Area Survey Generator — RocketDNA"); root.geometry("540x960")
    BG,FG,AC,CD,EB="#1a1a2e","#e0e0e0","#3b82f6","#16213e","#0f3460"
    root.configure(bg=BG)
    cv=Canvas(root,bg=BG,highlightthickness=0); sb=Scrollbar(root,orient="vertical",command=cv.yview)
    sf=Frame(cv,bg=BG); sf.bind("<Configure>",lambda e:cv.configure(scrollregion=cv.bbox("all")))
    cv.create_window((0,0),window=sf,anchor="nw"); cv.configure(yscrollcommand=sb.set)
    sb.pack(side=RIGHT,fill=Y); cv.pack(side=LEFT,fill=BOTH,expand=True)
    cv.bind_all("<MouseWheel>",lambda e:cv.yview_scroll(int(-1*(e.delta/120)),"units"))

    kv,dv=StringVar(),StringVar(); cmv=StringVar(value="M4D Wide (24mm)")
    clv=StringVar(value="Ortho"); hmv=StringVar(value="AGL"); shv=StringVar(value="Distance")
    fiv=StringVar(value="Return to Home"); dtv=StringVar(value="AHD")
    av,sv=DoubleVar(value=120),DoubleVar(value=12); tv,crv=DoubleVar(value=15),DoubleVar(value=0)
    gsd_var=DoubleVar(value=gsd(120,CAMS[cmv.get()]))
    thv,rhv=DoubleVar(value=120),DoubleVar(value=100); fov,sov=IntVar(value=80),IntVar(value=70)
    mv,tiv=IntVar(value=0),DoubleVar(value=100); sov2,rv=BooleanVar(),BooleanVar()
    ev,gv,bv=BooleanVar(value=True),BooleanVar(value=True),BooleanVar(value=True)
    _updating=False

    def sec(t):
        f=LabelFrame(sf,text=t,bg=CD,fg=AC,font=("Segoe UI",10,"bold"),padx=10,pady=6,relief=GROOVE,bd=1)
        f.pack(fill=X,padx=10,pady=3); return f
    def lb(p,t,r,c=0): Label(p,text=t,bg=CD,fg=FG,font=("Segoe UI",9)).grid(row=r,column=c,sticky=W,pady=2)
    def en(p,v,r,c=1):
        e=Entry(p,textvariable=v,bg=EB,fg=FG,insertbackground=FG,font=("Segoe UI",9),width=12,relief="flat",bd=2)
        e.grid(row=r,column=c,sticky=E,pady=2,padx=4); return e

    Label(sf,text="FH2 Area Survey Generator",bg=BG,fg=AC,font=("Segoe UI",14,"bold")).pack(pady=(8,1))
    Label(sf,text="RocketDNA Mission Planning",bg=BG,fg="#888",font=("Segoe UI",9)).pack(pady=(0,6))

    f=sec("Files")
    Button(f,text="Select KML/KMZ Polygon...",command=lambda:kv.set(filedialog.askopenfilename(filetypes=[("KML/KMZ","*.kml *.kmz")]) or kv.get()),bg=AC,fg="white",font=("Segoe UI",9),relief="flat").grid(row=0,column=0,columnspan=2,sticky="ew",pady=2)
    Label(f,textvariable=kv,bg=CD,fg="#aaa",font=("Segoe UI",8),wraplength=460).grid(row=1,column=0,columnspan=2,sticky=W)
    Button(f,text="Select DSM GeoTIFF (optional)...",command=lambda:dv.set(filedialog.askopenfilename(filetypes=[("GeoTIFF","*.tif *.tiff")]) or dv.get()),bg="#2d6a4f",fg="white",font=("Segoe UI",9),relief="flat").grid(row=2,column=0,columnspan=2,sticky="ew",pady=2)
    Label(f,textvariable=dv,bg=CD,fg="#aaa",font=("Segoe UI",8),wraplength=460).grid(row=3,column=0,columnspan=2,sticky=W)
    lb(f,"DSM Datum:",4); ttk.Combobox(f,textvariable=dtv,values=["AHD","EGM96","Ellipsoidal"],state="readonly",width=14).grid(row=4,column=1,sticky=E)

    f=sec("Camera & Collection")
    lb(f,"Drone/Camera:",0); ttk.Combobox(f,textvariable=cmv,values=list(CAMS.keys()),state="readonly",width=20).grid(row=0,column=1,sticky=E)
    cf=Frame(f,bg=CD); cf.grid(row=1,column=0,columnspan=2,sticky="ew",pady=4)
    def sc(v):
        clv.set(v)
        ob.configure(bg=AC if v=="Ortho" else EB); ib.configure(bg=AC if v=="Oblique" else EB)
    ob=Button(cf,text="Ortho",command=lambda:sc("Ortho"),bg=AC,fg="white",font=("Segoe UI",9),relief="flat",padx=16)
    ob.pack(side=LEFT,expand=True,fill=X,padx=2)
    ib=Button(cf,text="Oblique",command=lambda:sc("Oblique"),bg=EB,fg="white",font=("Segoe UI",9),relief="flat",padx=16)
    ib.pack(side=LEFT,expand=True,fill=X,padx=2)
    lb(f,"GSD:",2)
    gsd_frame=Frame(f,bg=CD); gsd_frame.grid(row=2,column=1,sticky=E,pady=2)
    Entry(gsd_frame,textvariable=gsd_var,bg=EB,fg=FG,insertbackground=FG,font=("Segoe UI",9),
          width=8,relief="flat",bd=2).pack(side=LEFT)
    Label(gsd_frame,text="cm/px",bg=CD,fg=AC,font=("Segoe UI",9,"bold")).pack(side=LEFT,padx=(4,0))
    nudges=Frame(f,bg=CD); nudges.grid(row=3,column=0,columnspan=2,sticky=W,pady=(2,0))

    def _nudge_gsd(delta):
        nonlocal _updating
        try:
            g=max(float(gsd_var.get())+delta,0.01)
            _updating=True
            gsd_var.set(round(g,2))
        except: pass
        finally:
            _updating=False
            _set_altitude_from_gsd()

    for txt,delta in [("-1",-1.0),("-0.1",-0.1),("+0.1",0.1),("+1",1.0)]:
        Button(nudges,text=txt,command=lambda d=delta:_nudge_gsd(d),bg=EB,fg=FG,font=("Segoe UI",8),
               relief="flat",padx=6).pack(side=LEFT,padx=1)

    def _set_gsd_from_altitude():
        nonlocal _updating
        if _updating: return
        try:
            c=CAMS[cmv.get()]; a=max(float(av.get()),0.01)
            _updating=True
            gsd_var.set(round(gsd(a,c),2))
        except: pass
        finally:
            _updating=False

    def _set_altitude_from_gsd(*_):
        nonlocal _updating
        if _updating: return
        try:
            c=CAMS[cmv.get()]; g=max(float(gsd_var.get()),0.01)
            _updating=True
            av.set(round(alt_gsd(g,c),2))
            gsd_var.set(round(g,2))
        except: pass
        finally:
            _updating=False

    def _on_altitude_change(*_): _set_gsd_from_altitude()
    def _on_camera_change(*_): _set_gsd_from_altitude()
    av.trace_add("write",_on_altitude_change); cmv.trace_add("write",_on_camera_change); gsd_var.trace_add("write",_set_altitude_from_gsd)
    Checkbutton(f,text="Smart Oblique",variable=sov2,bg=CD,fg=FG,selectcolor=EB,font=("Segoe UI",9)).grid(row=4,column=0,columnspan=2,sticky=W)

    f=sec("Altitude")
    mf=Frame(f,bg=CD); mf.grid(row=0,column=0,columnspan=2,sticky="ew",pady=2)
    def shm(v):
        hmv.set(v)
        for b,m in[(ab,"ASL"),(tb,"ALT"),(gb,"AGL")]: b.configure(bg=AC if m==v else EB,font=("Segoe UI",9,"bold") if m==v else ("Segoe UI",9))
    ab=Button(mf,text="ASL",command=lambda:shm("ASL"),bg=EB,fg="white",font=("Segoe UI",9),relief="flat",padx=14); ab.pack(side=LEFT,expand=True,fill=X,padx=1)
    tb=Button(mf,text="ALT",command=lambda:shm("ALT"),bg=EB,fg="white",font=("Segoe UI",9),relief="flat",padx=14); tb.pack(side=LEFT,expand=True,fill=X,padx=1)
    gb=Button(mf,text="AGL",command=lambda:shm("AGL"),bg=AC,fg="white",font=("Segoe UI",9,"bold"),relief="flat",padx=14); gb.pack(side=LEFT,expand=True,fill=X,padx=1)
    lb(f,"Altitude (m):",1); en(f,av,1)
    Checkbutton(f,text="Real-Time Terrain Follow",variable=rv,bg=CD,fg=FG,selectcolor=EB,font=("Segoe UI",9)).grid(row=2,column=0,columnspan=2,sticky=W)

    f=sec("Flight")
    lb(f,"Speed (m/s):",0); en(f,sv,0); lb(f,"Course Angle (°):",1); en(f,crv,1)
    Checkbutton(f,text="Elevation Optimization",variable=ev,bg=CD,fg=FG,selectcolor=EB,font=("Segoe UI",9)).grid(row=2,column=0,columnspan=2,sticky=W)

    f=sec("Safety & Completion")
    lb(f,"Takeoff Height (m):",0); en(f,thv,0); lb(f,"RTH Height (m):",1); en(f,rhv,1)
    lb(f,"Transit Speed (m/s):",2); en(f,tv,2); lb(f,"On Completion:",3)
    ttk.Combobox(f,textvariable=fiv,values=["Return to Home","Auto Land","Hover"],state="readonly",width=16).grid(row=3,column=1,sticky=E)

    f=sec("Advanced")
    lb(f,"Forward Overlap (%):",0); en(f,fov,0); lb(f,"Side Overlap (%):",1); en(f,sov,1)
    lb(f,"Margin (m):",2); en(f,mv,2)
    lb(f,"Photo Mode:",3)
    pmf=Frame(f,bg=CD); pmf.grid(row=3,column=1,sticky=E,pady=2)
    def set_shoot(v):
        shv.set(v)
        db.configure(bg=AC if v=="Distance" else EB); tmb.configure(bg=AC if v=="Time" else EB)
    db=Button(pmf,text="Distance",command=lambda:set_shoot("Distance"),bg=AC,fg="white",font=("Segoe UI",8),relief="flat",padx=8)
    db.pack(side=LEFT,padx=1)
    tmb=Button(pmf,text="Time",command=lambda:set_shoot("Time"),bg=EB,fg="white",font=("Segoe UI",8),relief="flat",padx=8)
    tmb.pack(side=LEFT,padx=1)
    # Computed interval display
    iv_lbl=Label(f,text="",bg=CD,fg="#aaa",font=("Segoe UI",8)); iv_lbl.grid(row=4,column=0,columnspan=2,sticky=W)
    def upd_iv(*_):
        try:
            c=CAMS[cmv.get()]; a=av.get(); fo=float(fov.get()); so2=float(sov.get())
            pi_v=photo_iv(a,fo,c); ls_v=line_sp(a,so2,c)
            iv_lbl.config(text=f"Photo every {pi_v:.1f}m along line  |  Lines {ls_v:.1f}m apart")
        except: pass
    av.trace_add("write",upd_iv); fov.trace_add("write",upd_iv)
    sov.trace_add("write",upd_iv); cmv.trace_add("write",upd_iv)
    upd_iv()
    Checkbutton(f,text="GEO Zone Bypassing",variable=gv,bg=CD,fg=FG,selectcolor=EB,font=("Segoe UI",9)).grid(row=5,column=0,columnspan=2,sticky=W)
    Checkbutton(f,text="Bypass Obstacle",variable=bv,bg=CD,fg=FG,selectcolor=EB,font=("Segoe UI",9)).grid(row=6,column=0,columnspan=2,sticky=W)

    def mkp():
        fm={"Return to Home":"goHome","Auto Land":"autoLand","Hover":"goContinue"}
        gsd_override=None
        try:
            gv=float(gsd_var.get())
            gsd_override=gv if gv>0 else None
        except: pass
        return SP(alt=av.get(),hm=hmv.get(),tf=hmv.get()=="AGL" and not rv.get(),rttf=rv.get(),
            coll="oblique" if clv.get()=="Oblique" else "ortho",so=sov2.get(),
            fov=float(fov.get()),sov=float(sov.get()),course=crv.get(),speed=sv.get(),
            margin=float(mv.get()),shoot="time" if shv.get()=="Time" else "distance",elev_opt=ev.get(),
            toff_h=thv.get(),rth_h=rhv.get(),tspd=tv.get(),finish=fm.get(fiv.get(),"goHome"),
            gz=gv.get(),bypass=bv.get(),dsm=dv.get() or None,ti=tiv.get(),gsd_ov=gsd_override,cam_key=cmv.get())

    def do_gen():
        print("\n[GENERATE] ══════════════════════════════════════")
        if not kv.get():
            print("[GENERATE] No KML selected"); messagebox.showerror("Error","Select a KML/KMZ polygon."); return
        out=filedialog.asksaveasfilename(defaultextension=".kmz",filetypes=[("KMZ","*.kmz")])
        if not out: print("[GENERATE] Cancelled"); return
        p=mkp()
        print(f"[GENERATE] KML: {kv.get()}")
        print(f"[GENERATE] DSM: {p.dsm or 'None'}")
        print(f"[GENERATE] Output: {out}")
        print(f"[GENERATE] Mode: {p.coll} | SmartOblique: {p.so} | Alt: {p.alt}m {p.hm} | GSD: {gsd(p.alt,CAMS[p.cam_key]):.2f} cm/px | Course: {p.course}°")
        print(f"[GENERATE] Overlap: fwd={p.fov}% side={p.sov}% | Speed: {p.speed}m/s | Shoot: {p.shoot}")
        print(f"[GENERATE] Geozone bypass: {p.gz} | Obstacle bypass: {p.bypass}")
        try:
            st,vz=generate(kv.get(),p.dsm,out,p,dat=dtv.get(),preview=True)
            md=p.coll.title()+(" + Smart Oblique" if p.so else "")
            print(f"[GENERATE] ✅ Success: {st['n_lines']} lines, {st['n_waypoints']} WPs, {st['total_distance_m']:.0f}m")
            messagebox.showinfo("Done",f"✅ {md} route saved\n\nLines: {st['n_lines']} | WPs: {st['n_waypoints']}\nDist: {st['total_distance_m']:.0f}m | Time: {st['duration_min']:.1f}min\nPhotos: ~{st['n_photos_est']} | GSD: {st['gsd_cm']:.2f} cm/px\n\n{out}")
            if HAS_MPL and vz:
                print("[GENERATE] Showing visualization...")
                viz_survey(parse_kml(kv.get()),vz,p,st,show=True)
        except Exception as e:
            import traceback
            print(f"[GENERATE] ERROR: {e}")
            traceback.print_exc()
            messagebox.showerror("Error",str(e))

    def do_prev():
        print("\n[PREVIEW] ══════════════════════════════════════")
        if not kv.get():
            print("[PREVIEW] No KML selected"); messagebox.showerror("Error","Select a KML/KMZ polygon."); return
        try:
            p=mkp(); c=CAMS[p.cam_key]
            print(f"[PREVIEW] KML: {kv.get()}")
            print(f"[PREVIEW] Mode: {p.coll} | SmartOblique: {p.so} | Alt: {p.alt}m | GSD: {gsd(p.alt,CAMS[p.cam_key]):.2f} cm/px | Course: {p.course}°")
            poly=parse_kml(kv.get())
            print(f"[PREVIEW] Polygon parsed: {len(poly)} vertices")
            cx,cy=poly[:,0].mean(),poly[:,1].mean(); ep,cn=det_epsg(cx,cy)
            print(f"[PREVIEW] CRS: {cn} (EPSG:{ep})")
            ls_v=line_sp(p.alt,p.sov,c); pi_v=photo_iv(p.alt,p.fov,c)
            print(f"[PREVIEW] Line spacing: {ls_v:.1f}m | Photo interval: {pi_v:.1f}m")
            perp=(p.course+90)%360; ob_off=p.alt/math.tan(math.radians(45)) if p.coll=="oblique" else 0
            viz=[]; nl=gen_lines(poly,p.course,ls_v,ep); tl=len(nl); tw=sum(len(l) for l in nl)
            print(f"[PREVIEW] Nadir lines generated: {tl}")
            if p.coll=="ortho":
                viz.append({"label":"Nadir"+(" + Smart Oblique" if p.so else ""),"color":PC["smart" if p.so else "nadir"],"lines":nl})
            else:
                viz.append({"label":"Nadir (-90°)","color":PC["nadir"],"lines":nl})
                if not p.so:
                    for lb2,fb,od,clr in[("E oblique",p.course,90,PC["ob_e"]),("S oblique",perp,180,PC["ob_s"]),
                                          ("W oblique",p.course,270,PC["ob_w"]),("N oblique",perp,0,PC["ob_n"])]:
                        ol=gen_lines(poly,fb,ls_v,ep,ob_off,od)
                        if ol: viz.append({"label":lb2,"color":clr,"lines":ol}); tl+=len(ol); tw+=sum(len(l) for l in ol)
                        print(f"[PREVIEW] {lb2}: {len(ol)} lines")
                else:
                    tf_t=Transformer.from_crs("EPSG:4326",f"EPSG:{ep}",always_xy=True)
                    tf_b=Transformer.from_crs(f"EPSG:{ep}","EPSG:4326",always_xy=True)
                    ext=Polygon([tf_t.transform(lo,la) for lo,la in poly]).buffer(ob_off)
                    ec=np.array([tf_b.transform(x,y) for x,y in ext.exterior.coords])
                    ol=gen_lines(ec,p.course,ls_v,ep)
                    viz=[{"label":"Oblique+Smart","color":PC["smart"],"lines":ol}]; tl=len(ol); tw=sum(len(l) for l in ol)
                    print(f"[PREVIEW] Oblique+Smart: {tl} lines")
            td=sum(_dm(ln[i][0],ln[i][1],ln[i+1][0],ln[i+1][1]) for ps in viz for ln in ps["lines"] for i in range(len(ln)-1))
            st={"n_lines":tl,"n_waypoints":tw,"total_distance_m":td,"duration_min":td/p.speed/60,
                "n_photos_est":int(td/pi_v),"line_spacing_m":ls_v,"photo_interval_m":pi_v,"gsd_cm":gsd(p.alt,c),"altitude_m":p.alt}
            print(f"[PREVIEW] Total: {tl} lines, {tw} WPs, {td:.0f}m, {td/p.speed/60:.1f}min")
            print(f"[PREVIEW] Calling viz_survey...")
            viz_survey(poly,viz,p,st,show=True)
            print(f"[PREVIEW] Complete")
        except Exception as e:
            import traceback
            print(f"[PREVIEW] ERROR: {e}")
            traceback.print_exc()
            messagebox.showerror("Preview Error", str(e))

    Button(sf,text="▶  Generate Survey Route",command=do_gen,bg="#10b981",fg="white",font=("Segoe UI",12,"bold"),relief="flat",padx=20,pady=10,cursor="hand2").pack(fill=X,padx=10,pady=8)
    Button(sf,text="👁  Preview Flight Lines",command=do_prev,bg="#6366f1",fg="white",font=("Segoe UI",10),relief="flat",padx=16,pady=6,cursor="hand2").pack(fill=X,padx=10,pady=(0,10))
    _set_gsd_from_altitude(); root.mainloop()

# ══════════════════════════════════════════════════════════════════════
if __name__=="__main__":
    import argparse
    pa=argparse.ArgumentParser(description="FH2 Area Survey Generator — RocketDNA")
    pa.add_argument("--kml"); pa.add_argument("--dsm"); pa.add_argument("-o","--output")
    pa.add_argument("--altitude",type=float,default=120); pa.add_argument("--height-mode",choices=["ASL","ALT","AGL"],default="AGL")
    pa.add_argument("--rttf",action="store_true"); pa.add_argument("--collection",choices=["ortho","oblique"],default="ortho")
    pa.add_argument("--smart-oblique",action="store_true"); pa.add_argument("--forward-overlap",type=float,default=80)
    pa.add_argument("--side-overlap",type=float,default=70); pa.add_argument("--course",type=float,default=0)
    pa.add_argument("--speed",type=float,default=12); pa.add_argument("--margin",type=float,default=0)
    pa.add_argument("--takeoff-height",type=float,default=120); pa.add_argument("--camera",default="M4D Wide (24mm)")
    pa.add_argument("--dsm-datum",default="AHD"); pa.add_argument("--terrain-interval",type=float,default=100)
    pa.add_argument("--preview",action="store_true"); pa.add_argument("--gui",action="store_true")
    a=pa.parse_args()
    if a.gui or not a.kml: launch_gui(); sys.exit()
    if not a.output: print("Error: -o required"); sys.exit(1)
    p=SP(alt=a.altitude,hm=a.height_mode,tf=a.height_mode=="AGL" and not a.rttf,rttf=a.rttf,
         coll=a.collection,so=a.smart_oblique,fov=a.forward_overlap,sov=a.side_overlap,
         course=a.course,speed=a.speed,margin=a.margin,toff_h=a.takeoff_height,
         dsm=a.dsm,ti=a.terrain_interval,cam_key=a.camera)
    st,_=generate(a.kml,a.dsm,a.output,p,dat=a.dsm_datum,preview=a.preview)
    print(f"✅ Generated: {a.output}")
    for k,v in st.items():
        if k!="preview": print(f"   {k}: {v}")
