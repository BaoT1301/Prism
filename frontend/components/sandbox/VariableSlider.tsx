import type { SandboxVariable } from "../../features/sandbox/sandbox-types";

export function VariableSlider({ variable, value, onChange }: { variable: SandboxVariable; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{variable.label} ({variable.unit})</span>
      <output>{value}</output>
      <input type="range" min={variable.min} max={variable.max} step={variable.step} value={value} disabled={!variable.editable} onChange={(event) => onChange(Number(event.target.value))} />
      <span>{variable.min}–{variable.max} {variable.unit}</span>
    </label>
  );
}
