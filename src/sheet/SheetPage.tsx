import { type Page } from "../model/page";
import { type SheetData, type TrackerState } from "../model/sheet";
import { CoreLeft } from "./CoreLeft";
import { CoreRight } from "./CoreRight";
import { Features } from "./Features";
import { SpellsKit } from "./SpellsKit";
import { SpellList } from "./SpellList";

type Props = {
  page: Page;
  characterId: string;
  sheet: SheetData;
  trackers: TrackerState;
};

export function SheetPage({ page, characterId, sheet, trackers }: Props) {
  const type = page.sheetPageType;
  if (!type) return null;
  switch (type) {
    case "core-left":
      return <CoreLeft characterId={characterId} sheet={sheet} trackers={trackers} />;
    case "core-right":
      return <CoreRight characterId={characterId} sheet={sheet} trackers={trackers} />;
    case "features":
      return <Features characterId={characterId} sheet={sheet} trackers={trackers} />;
    case "spells-kit":
      return <SpellsKit characterId={characterId} sheet={sheet} trackers={trackers} />;
    case "spell-list":
      return <SpellList sheet={sheet} />;
  }
}
