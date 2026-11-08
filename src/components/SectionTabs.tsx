import { useCallback, useState } from "react";
import { useNotebook } from "../store/notebook";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { SectionEditPopover } from "./SectionEditPopover";
import { confirmAction } from "./ConfirmDialog";
import { useDragReorder } from "./useDragReorder";

type Popover =
  | { kind: "add"; anchor: DOMRect }
  | { kind: "edit"; sectionId: string; anchor: DOMRect };

/**
 * Paper divider tabs down the right edge of the book, one per section. Click to open,
 * right-click to rename, recolour, move or remove, drag to reorder, "+" to add a section.
 */
export function SectionTabs({ characterId }: { characterId: string }) {
  const ch = useNotebook((s) => s.characters[characterId]);
  const view = useNotebook((s) => s.view);
  const openSection = useNotebook((s) => s.openSection);
  const moveSection = useNotebook((s) => s.moveSection);
  const [menu, setMenu] = useState<{ sectionId: string; x: number; y: number; anchor: DOMRect } | null>(
    null,
  );
  const [popover, setPopover] = useState<Popover | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closePopover = useCallback(() => setPopover(null), []);
  const onMove = useCallback(
    (id: string, slot: number) => void moveSection(characterId, id, slot),
    [moveSection, characterId],
  );
  const { listRef, drag, start, onClickCapture, dropMark } = useDragReorder<HTMLDivElement>(onMove);

  if (ch?.status !== "ok") return null;
  const sections = ch.character.sections;
  const ids = sections.map((s) => s.id);
  const activeId = "characterId" in view ? view.sectionId : sections[0]?.id;

  const menuItems = (sectionId: string, anchor: DOMRect): MenuItem[] => {
    const s = useNotebook.getState();
    const idx = ids.indexOf(sectionId);
    const section = sections[idx];
    const items: MenuItem[] = [
      { label: "Rename or recolour…", onSelect: () => setPopover({ kind: "edit", sectionId, anchor }) },
    ];
    if (idx > 0) items.push({ label: "Move up", onSelect: () => void s.moveSection(characterId, sectionId, idx - 1) });
    if (idx < ids.length - 1)
      items.push({ label: "Move down", onSelect: () => void s.moveSection(characterId, sectionId, idx + 2) });
    if (section.kind !== "sheet" && sections.length > 1) {
      items.push({
        label: "Remove section…",
        danger: true,
        onSelect: () => {
          const pages = ch.sectionPages[sectionId]?.length ?? 0;
          void confirmAction({
            title: `Remove ${section.name}?`,
            body:
              pages > 0
                ? `Its ${pages === 1 ? "page goes" : `${pages} pages go`} to the Recycle Bin with the section's folder. You can restore them from there.`
                : "The empty section's folder goes to the Recycle Bin.",
            confirm: "Remove section",
            danger: true,
          }).then((ok) => ok && s.removeSection(characterId, sectionId));
        },
      });
    }
    return items;
  };

  return (
    <div
      className={`tabs${drag ? " reordering" : ""}`}
      role="tablist"
      aria-label={`${ch.character.name}'s sections`}
      aria-orientation="vertical"
      ref={listRef}
      onClickCapture={onClickCapture}
    >
      {sections.map((s, i) => {
        const on = s.id === activeId;
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={on}
            className={`tab${on ? " on" : ""}${drag?.id === s.id ? " dragging" : ""}`}
            data-reorder-id={s.id}
            data-drop={dropMark(ids, i)}
            style={on ? undefined : { background: s.colour }}
            title={`${s.name}. Right-click for options; drag to reorder.`}
            onClick={() => openSection(characterId, s.id)}
            onPointerDown={start(s.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              const anchor = e.currentTarget.getBoundingClientRect();
              setMenu({ sectionId: s.id, x: anchor.right + 6, y: anchor.top, anchor });
            }}
          >
            {s.name}
          </button>
        );
      })}
      <button
        className="tab add"
        aria-label="Add a section"
        title="Add a section"
        onClick={(e) => setPopover({ kind: "add", anchor: e.currentTarget.getBoundingClientRect() })}
      >
        +
      </button>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.sectionId, menu.anchor)} onClose={closeMenu} />
      )}
      {popover?.kind === "add" && (
        <SectionEditPopover
          anchor={popover.anchor}
          title="New section"
          initialName=""
          initialColour="#d9b7a2"
          submitLabel="Add section"
          onSubmit={(name, colour) => void useNotebook.getState().addSection(characterId, name, colour)}
          onClose={closePopover}
        />
      )}
      {popover?.kind === "edit" &&
        (() => {
          const s = sections.find((x) => x.id === popover.sectionId);
          if (!s) return null;
          return (
            <SectionEditPopover
              anchor={popover.anchor}
              title={`Edit ${s.name}`}
              initialName={s.name}
              initialColour={s.colour}
              submitLabel="Save"
              onSubmit={(name, colour) =>
                void useNotebook.getState().updateSection(characterId, s.id, { name, colour })
              }
              onClose={closePopover}
            />
          );
        })()}
    </div>
  );
}
