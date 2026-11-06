import { useCallback, useState } from "react";
import { useNotebook, visibleCharacters } from "../store/notebook";
import { useDragReorder } from "./useDragReorder";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { TabEditPopover } from "./TabEditPopover";
import { backend } from "../storage/backend";

/** Width of the shelf rail itself, px. */
export const SHELF_WIDTH = 104;
/** Spine dimensions: 60px wide, 224px tall. */
export const SPINE_W = 60;
export const SPINE_H = 224;

type Menu = { characterId: string; x: number; y: number; anchor: DOMRect };
type Editing = { characterId: string; anchor: DOMRect; focus: "name" | "colour" };

/** Left-side vertical book shelf: one spine per character. */
export function Shelf() {
  const config = useNotebook((s) => s.config);
  const view = useNotebook((s) => s.view);
  const characters = visibleCharacters(config);
  const ids = characters.map((c) => c.id);
  const moveCharacter = useNotebook((s) => s.moveCharacter);
  const openCharacter = useNotebook((s) => s.openCharacter);
  const openSettings = useNotebook((s) => s.setSettingsOpen);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const onMove = useCallback(
    (id: string, slot: number) => void moveCharacter(id, slot),
    [moveCharacter],
  );
  const { listRef, drag, start, onClickCapture, dropMark } = useDragReorder<HTMLDivElement>(onMove);

  const selectedId = "characterId" in view ? view.characterId : null;

  const openMenu = (characterId: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const anchor = e.currentTarget.getBoundingClientRect();
    setMenu({ characterId, anchor, x: anchor.right + 8, y: anchor.top });
  };

  const menuItems = (m: Menu): MenuItem[] => {
    const st = useNotebook.getState().characters[m.characterId];
    const items: MenuItem[] = [
      {
        label: "Rename",
        onSelect: () => setEditing({ characterId: m.characterId, anchor: m.anchor, focus: "name" }),
      },
      {
        label: "Change cover",
        onSelect: () =>
          setEditing({ characterId: m.characterId, anchor: m.anchor, focus: "colour" }),
      },
    ];
    if (st?.status === "ok") {
      items.push({
        label: "Open folder in Explorer",
        onSelect: () =>
          void backend
            .openInExplorer(st.notebookPath)
            .catch((e) => useNotebook.setState({ notice: String(e) })),
      });
    }
    items.push({
      label: "Archive",
      onSelect: () => void useNotebook.getState().archiveCharacter(m.characterId),
    });
    return items;
  };

  return (
    <nav
      className={`shelf${drag ? " reordering" : ""}`}
      aria-label="Characters"
      style={{ width: SHELF_WIDTH }}
    >
      <div className="spine-list" ref={listRef} onClickCapture={onClickCapture}>
        {characters.map((c, i) => {
          const isSelected = c.id === selectedId;
          return (
            <button
              key={c.id}
              className={`spine${isSelected ? " selected" : ""}${drag?.id === c.id ? " dragging" : ""}`}
              data-reorder-id={c.id}
              data-drop={dropMark(ids, i)}
              aria-current={isSelected ? "page" : undefined}
              aria-haspopup="menu"
              style={{
                background: c.cover,
                transform: isSelected ? "translateX(16px)" : undefined,
              }}
              onClick={() => openCharacter(c.id)}
              onContextMenu={openMenu(c.id)}
              onPointerDown={start(c.id)}
              title={`${c.name}. Right-click for options.`}
            >
              <span className="spine-title">{c.name}</span>
            </button>
          );
        })}
      </div>

      <button
        className="shelf-add"
        aria-label="Add character"
        title="Add character"
        onClick={() => openSettings(true)}
      >
        +
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu)}
          onClose={closeMenu}
        />
      )}
      {editing && (
        <TabEditPopover
          key={`${editing.characterId}-${editing.focus}`}
          tabId={editing.characterId}
          anchor={editing.anchor}
          focus={editing.focus}
          onClose={closeEdit}
        />
      )}
    </nav>
  );
}
