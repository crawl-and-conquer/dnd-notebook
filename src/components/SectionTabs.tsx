import { useNotebook } from "../store/notebook";

/** Width of the inactive tab strip, px. */
export const SECTION_TABS_WIDTH = 48;
/** Width of the active tab, px. */
export const SECTION_TABS_ACTIVE_WIDTH = 56;

/** Right-side vertical section tabs for the open character. */
export function SectionTabs({ characterId }: { characterId: string }) {
  const ch = useNotebook((s) => s.characters[characterId]);
  const view = useNotebook((s) => s.view);
  const openSection = useNotebook((s) => s.openSection);

  if (ch?.status !== "ok") return null;

  const sections = ch.character.sections;
  const activeSectionId = "characterId" in view ? view.sectionId : sections[0]?.id;

  return (
    <nav className="section-tabs" aria-label="Sections">
      {sections.map((s) => {
        const isActive = s.id === activeSectionId;
        return (
          <button
            key={s.id}
            className={`section-tab${isActive ? " active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            style={{
              background: s.colour,
              width: isActive ? SECTION_TABS_ACTIVE_WIDTH : SECTION_TABS_WIDTH,
            }}
            onClick={() => openSection(characterId, s.id)}
            title={s.name}
          >
            <span className="section-tab-label">{s.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
