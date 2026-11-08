import { useCallback, useState } from "react";
import { useNotebook, visibleCharacters } from "../store/notebook";
import { useDragReorder } from "./useDragReorder";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { TabEditPopover } from "./TabEditPopover";
import { backend } from "../storage/backend";
import { useNewCharacterDialog } from "./NewCharacterDialog";
import { useChangeFolder } from "./ChangeFolderDialog";
import { useImportDialog } from "./ImportDialog";

type Menu = { characterId: string; x: number; y: number; anchor: DOMRect };
type Editing = { characterId: string; anchor: DOMRect; focus: "name" | "colour" };

/** The shelf down the left: one book spine per character, and a dashed spine to add one. */
export function Shelf() {
  const config = useNotebook((s) => s.config);
  const view = useNotebook((s) => s.view);
  const characters = visibleCharacters(config);
  const ids = characters.map((c) => c.id);
  const moveCharacter = useNotebook((s) => s.moveCharacter);
  const openCharacter = useNotebook((s) => s.openCharacter);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const onMove = useCallback((id: string, slot: number) => void moveCharacter(id, slot), [moveCharacter]);
  const { listRef, drag, start, onClickCapture, dropMark } = useDragReorder<HTMLDivElement>(onMove);

  const selectedId = "characterId" in view ? view.characterId : null;

  const openMenu = (characterId: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const anchor = e.currentTarget.getBoundingClientRect();
    setMenu({ characterId, anchor, x: anchor.right + 8, y: anchor.top });
  };

  const menuItems = (m: Menu): MenuItem[] => {
    const s = useNotebook.getState();
    const st = s.characters[m.characterId];
    const open = () => {
      if (!("characterId" in s.view) || s.view.characterId !== m.characterId) openCharacter(m.characterId);
    };
    const items: MenuItem[] = [
      { label: "Rename", onSelect: () => setEditing({ characterId: m.characterId, anchor: m.anchor, focus: "name" }) },
      {
        label: "Cover colour",
        onSelect: () => setEditing({ characterId: m.characterId, anchor: m.anchor, focus: "colour" }),
      },
    ];
    if (st?.status === "ok") {
      items.push({
        label: "Open folder in Explorer",
        onSelect: () =>
          void backend.openInExplorer(st.notebookPath).catch((e) => useNotebook.setState({ notice: String(e) })),
      });
    }
    items.push({ label: "Change folder…", onSelect: () => useChangeFolder.getState().open(m.characterId) });
    if (st?.status === "ok") {
      items.push(
        {
          label: "Handwriting builder",
          onSelect: () => {
            open();
            s.setHandwritingOpen(true);
          },
        },
        {
          label: "Import character sheet…",
          onSelect: () => {
            open();
            useImportDialog.getState().setOpen(true);
          },
        },
      );
    }
    items.push({ label: "Archive", onSelect: () => void s.archiveCharacter(m.characterId) });
    return items;
  };

  return (
    <nav className={`shelf${drag ? " reordering" : ""}`} aria-label="Characters">
      <h2>Party</h2>
      <div className="spine-list" ref={listRef} onClickCapture={onClickCapture}>
        {characters.map((c, i) => {
          const isSelected = c.id === selectedId;
          return (
            <button
              key={c.id}
              className={`spine${isSelected ? " on" : ""}${drag?.id === c.id ? " dragging" : ""}`}
              data-reorder-id={c.id}
              data-drop={dropMark(ids, i)}
              aria-current={isSelected ? "true" : undefined}
              aria-haspopup="menu"
              style={{ background: c.cover }}
              onClick={() => openCharacter(c.id)}
              onContextMenu={openMenu(c.id)}
              onPointerDown={start(c.id)}
              title={`${c.name}. Right-click for options; drag to reorder.`}
            >
              <span className="bd" aria-hidden="true" />
              <span className="nm">{c.name}</span>
              <span className="bd" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <button
        className="spine new"
        aria-label="New character"
        onClick={() => useNewCharacterDialog.getState().setOpen(true)}
      >
        <span className="plus" aria-hidden="true">
          +
        </span>
        <span className="nm">New</span>
      </button>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={closeMenu} />}
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
