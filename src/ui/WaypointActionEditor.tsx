import { ACTION_CATALOGUE, PALETTE_CATEGORIES, createAction, getActionLabel, getActionEntry } from "../domain/actions";
import type { WaypointAction, WaypointActionType } from "../domain/types";

interface Props {
  actions: WaypointAction[];
  onChange: (actions: WaypointAction[]) => void;
  payloadEnum: number;
}

function LensSelector({
  value,
  payloadEnum,
  onSelect,
}: {
  value: string;
  payloadEnum: number;
  onSelect: (lens: string) => void;
}) {
  const isThermal = payloadEnum === 99;
  if (!isThermal) return null;

  return (
    <label>
      Lens
      <select value={value} onChange={(e) => onSelect(e.target.value)}>
        <option value="visable">Visible</option>
        <option value="ir">IR</option>
        <option value="both">Both</option>
      </select>
    </label>
  );
}

function ActionParamEditor({
  action,
  onUpdate,
  payloadEnum,
}: {
  action: WaypointAction;
  onUpdate: (updates: Partial<WaypointAction>) => void;
  payloadEnum: number;
}) {
  const updateParam = (key: string, value: string | number) => {
    onUpdate({ params: { ...action.params, [key]: value } });
  };

  const setLens = (lens: string) => {
    onUpdate({ params: { ...action.params, payloadLensIndex: lens, useGlobalPayloadLensIndex: 0 } });
  };

  const entry = getActionEntry(action.type);
  const showLens = entry?.hasLens ?? false;

  const lensSelector = showLens ? (
    <LensSelector
      value={String(action.params.payloadLensIndex ?? "visable")}
      payloadEnum={payloadEnum}
      onSelect={setLens}
    />
  ) : null;

  switch (action.type) {
    case "takePhoto":
      return (
        <>
          <label>
            Suffix
            <input
              type="text"
              value={String(action.params.fileSuffix ?? "")}
              onChange={(e) => updateParam("fileSuffix", e.target.value)}
              placeholder="Optional name"
            />
          </label>
          {lensSelector}
        </>
      );

    case "startRecord":
      return <>{lensSelector}</>;

    case "stopRecord":
      return null;

    case "timedIntervalShot":
      return (
        <>
          <label>
            Interval (s)
            <input
              type="number"
              min={1}
              step={1}
              value={action.triggerParam ?? 3}
              onChange={(e) => onUpdate({ triggerParam: Number(e.target.value) })}
            />
          </label>
          {lensSelector}
        </>
      );

    case "distanceIntervalShot":
      return (
        <>
          <label>
            Interval (m)
            <input
              type="number"
              min={1}
              step={1}
              value={action.triggerParam ?? 10}
              onChange={(e) => onUpdate({ triggerParam: Number(e.target.value) })}
            />
          </label>
          {lensSelector}
        </>
      );

    case "endIntervalShot":
      return null;

    case "gimbalRotate":
      return (
        <>
          <label>
            Pitch (deg)
            <input
              type="number"
              min={-90}
              max={30}
              value={Number(action.params.gimbalPitchRotateAngle ?? -45)}
              onChange={(e) => updateParam("gimbalPitchRotateAngle", Number(e.target.value))}
            />
          </label>
          <label>
            Yaw (deg)
            <input
              type="number"
              min={-180}
              max={180}
              value={Number(action.params.gimbalYawRotateAngle ?? 0)}
              onChange={(e) => {
                const val = Number(e.target.value);
                onUpdate({
                  params: {
                    ...action.params,
                    gimbalYawRotateAngle: val,
                    gimbalYawRotateEnable: val !== 0 ? 1 : 0,
                  },
                });
              }}
            />
          </label>
        </>
      );

    case "zoom":
      return (
        <label>
          Focal length (mm)
          <input
            type="number"
            min={24}
            max={168}
            value={Number(action.params.focalLength ?? 24)}
            onChange={(e) => updateParam("focalLength", Number(e.target.value))}
          />
        </label>
      );

    case "orientedShoot":
      return (
        <>
          <label>
            Gimbal pitch (deg)
            <input
              type="number"
              min={-90}
              max={0}
              value={Number(action.params.gimbalPitchRotateAngle ?? -45)}
              onChange={(e) => updateParam("gimbalPitchRotateAngle", Number(e.target.value))}
            />
          </label>
          <label>
            Gimbal yaw (deg)
            <input
              type="number"
              min={-180}
              max={180}
              value={Number(action.params.gimbalYawRotateAngle ?? 0)}
              onChange={(e) => updateParam("gimbalYawRotateAngle", Number(e.target.value))}
            />
          </label>
          <label>
            Aircraft heading (deg)
            <input
              type="number"
              min={0}
              max={360}
              value={Number(action.params.aircraftHeading ?? 0)}
              onChange={(e) => updateParam("aircraftHeading", Number(e.target.value))}
            />
          </label>
          <label>
            Focal length (mm)
            <input
              type="number"
              min={24}
              max={168}
              value={Number(action.params.focalLength ?? 24)}
              onChange={(e) => updateParam("focalLength", Number(e.target.value))}
            />
          </label>
          {lensSelector}
        </>
      );

    case "panoShot":
      return (
        <>
          <label>
            Mode
            <select
              value={String(action.params.panoShotSubMode ?? "panoShot_360")}
              onChange={(e) => updateParam("panoShotSubMode", e.target.value)}
            >
              <option value="panoShot_360">360</option>
            </select>
          </label>
          {lensSelector}
        </>
      );

    case "rotateYaw":
      return (
        <>
          <label>
            Heading (deg)
            <input
              type="number"
              min={0}
              max={360}
              value={Number(action.params.aircraftHeading ?? 0)}
              onChange={(e) => updateParam("aircraftHeading", Number(e.target.value))}
            />
          </label>
          <label>
            Direction
            <select
              value={String(action.params.aircraftPathMode ?? "clockwise")}
              onChange={(e) => updateParam("aircraftPathMode", e.target.value)}
            >
              <option value="clockwise">Clockwise</option>
              <option value="counterClockwise">Counter-clockwise</option>
            </select>
          </label>
        </>
      );

    case "hover":
      return (
        <label>
          Duration (s)
          <input
            type="number"
            min={0}
            step={0.5}
            value={Number(action.params.hoverTime ?? 3)}
            onChange={(e) => updateParam("hoverTime", Number(e.target.value))}
          />
        </label>
      );

    case "customDirName":
      return null;

    case "recordCurrentAttitude":
      return null;

    default:
      return null;
  }
}

export function WaypointActionEditor({ actions, onChange, payloadEnum }: Props) {
  const addAction = (type: WaypointActionType) => {
    onChange([...actions, createAction(type)]);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<WaypointAction>) => {
    const next = [...actions];
    const current = next[index];
    next[index] = {
      ...current,
      ...updates,
      params: updates.params ?? current.params,
    };
    onChange(next);
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= actions.length) return;
    const next = [...actions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const categories = PALETTE_CATEGORIES.map((cat) => ({
    ...cat,
    types: ACTION_CATALOGUE.filter((a) => a.category === cat.key),
  }));

  return (
    <div className="action-editor">
      <div className="action-list">
        {actions.length === 0 && (
          <p className="action-empty">No actions. Add from palette below.</p>
        )}
        {actions.map((action, i) => (
          <div key={action.id} className="action-item">
            <div className="action-item-header">
              <span className="action-item-index">{i + 1}</span>
              <span className="action-item-label">{getActionLabel(action.type)}</span>
              {action.triggerType && action.triggerType !== "reachPoint" && (
                <span className="action-trigger-badge">
                  {action.triggerType === "multipleTiming" ? `every ${action.triggerParam}s` : `every ${action.triggerParam}m`}
                </span>
              )}
              <div className="action-item-controls">
                <button
                  className="btn btn-secondary action-move-btn"
                  onClick={() => moveAction(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >^</button>
                <button
                  className="btn btn-secondary action-move-btn"
                  onClick={() => moveAction(i, 1)}
                  disabled={i === actions.length - 1}
                  title="Move down"
                >v</button>
                <button
                  className="btn btn-secondary action-remove-btn"
                  onClick={() => removeAction(i)}
                  title="Remove"
                >x</button>
              </div>
            </div>
            <div className="action-item-params">
              <ActionParamEditor
                action={action}
                onUpdate={(updates) => updateAction(i, updates)}
                payloadEnum={payloadEnum}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="action-palette">
        <h4>Add Action</h4>
        {categories.map((cat) => (
          <div key={cat.key} className="action-palette-category">
            <span className="action-palette-category-label">{cat.label}</span>
            <div className="action-palette-buttons">
              {cat.types.map((entry) => (
                <button
                  key={entry.type}
                  className="btn btn-secondary action-palette-btn"
                  onClick={() => addAction(entry.type)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
