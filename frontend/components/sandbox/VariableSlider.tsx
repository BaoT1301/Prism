import type { SandboxVariable } from "../../features/sandbox/sandbox-types";

export function VariableSlider({ variable, value, onChange }: { variable: SandboxVariable; value: number; onChange: (value: number) => void }) {
  return <label className="variable-card"><span className="variable-topline"><span><strong>{variable.label}</strong><small>{variable.unit}</small></span><output>{value} <small>{variable.unit}</small></output></span><input type="range" min={variable.min} max={variable.max} step={variable.step} value={value} disabled={!variable.editable} onChange={(event) => onChange(Number(event.target.value))} /><span className="range-labels"><small>{variable.min}</small><small>{variable.max} {variable.unit}</small></span></label>;
}
