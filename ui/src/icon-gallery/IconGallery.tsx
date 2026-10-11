import { APPEARANCE_LABELS, APPEARANCES } from "../appearance";
import type { Appearance } from "../appearance";
import { APP_ICONS } from "../desktop/AppIcons";
import { IdeIcon } from "../features/settings/IdeIcons";
import { EDITOR_IDS, EDITOR_LABELS } from "../state/editor";
import { TrafficLights } from "../desktop/TrafficLights";
import { APP_IDS, TITLES } from "../desktop/windows";

const SIZES = [16, 24, 32, 48, 64];

function DockRow({ mode }: { mode: Appearance }) {
  return (
    <section data-appearance={mode} className="wallpaper rounded-2xl p-5 text-[var(--text)]" style={{ background: "var(--wall)" }}>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="m-0 text-base font-semibold">{APPEARANCE_LABELS[mode]}</h2>
        <code className="text-xs text-[var(--muted)]">data-appearance="{mode}"</code>
      </header>
      <nav className="glass inline-flex flex-wrap gap-2 rounded-2xl px-3 py-2">
        {APP_IDS.map((id) => {
          const Icon = APP_ICONS[id];
          return (
            <span key={id} title={TITLES[id]} className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg2)] transition-transform hover:-translate-y-2 hover:scale-110">
              <Icon className="h-8 w-8" />
            </span>
          );
        })}
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bg2)] p-2 text-sm">
        {APP_IDS.map((id) => {
          const Icon = APP_ICONS[id];
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[var(--hover)]">
              <Icon size={18} /> {TITLES[id]}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function WindowControls() {
  const states = [
    { label: "Focused", isFocused: true, isMaximized: false },
    { label: "Unfocused", isFocused: false, isMaximized: false },
    { label: "Maximized", isFocused: true, isMaximized: true },
  ];
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg2)] p-5">
      <h2 className="m-0 mb-1 text-base font-semibold">Window controls</h2>
      <p className="mt-0 mb-4 text-sm text-[var(--muted)]">Hover a group to reveal glyphs.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {states.map(({ label, isFocused, isMaximized }) => (
          <div key={label} data-state={label.toLowerCase()} className="overflow-hidden rounded-xl border border-[var(--line)]">
            <div className="grid grid-cols-[56px_1fr_56px] items-center gap-3 border-b border-[var(--line)] px-3 py-2">
              <TrafficLights isFocused={isFocused} isMaximized={isMaximized} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />
              <span className={`text-center text-[13px] font-medium ${isFocused ? "" : "text-[var(--muted)]"}`}>{label}</span>
            </div>
            <div className="h-10" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SizeRamp() {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg2)] p-5">
      <h2 className="m-0 mb-4 text-base font-semibold">Size ramp</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[var(--muted)]">
            <th className="py-2 font-medium">App</th>
            {SIZES.map((size) => <th key={size} className="py-2 font-medium">{size}px</th>)}
          </tr>
        </thead>
        <tbody>
          {APP_IDS.map((id) => {
            const Icon = APP_ICONS[id];
            return (
              <tr key={id} className="border-t border-[var(--line)]">
                <td className="py-2">
                  {TITLES[id]} <code className="text-xs text-[var(--muted)]">{id}</code>
                </td>
                {SIZES.map((size) => <td key={size} className="py-2"><Icon size={size} /></td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function EditorIcons() {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg2)] p-5">
      <h2 className="m-0 mb-4 text-base font-semibold">Editors</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {EDITOR_IDS.map((id) => (
          <li key={id} className="flex items-center gap-2 text-[13px]">
            <IdeIcon id={id} size={24} />
            {EDITOR_LABELS[id]}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IconGallery() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 text-[var(--text)]">
      <header>
        <h1 className="m-0 text-2xl font-semibold">Icon gallery</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          App icons from <code>desktop/AppIcons.tsx</code> keep fixed colours. The Files folder follows each appearance via <code>styles/folder-icons.css</code>.
        </p>
      </header>
      {APPEARANCES.map((mode) => <DockRow key={mode} mode={mode} />)}
      <WindowControls />
      <EditorIcons />
      <SizeRamp />
    </main>
  );
}
