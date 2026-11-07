import { useCallback } from "react";
import { type SheetData, type TrackerState } from "../model/sheet";
import { useNotebook } from "../store/notebook";

type Props = {
  characterId: string;
  sheet: SheetData;
  trackers: TrackerState;
};

export function Features({ characterId, sheet, trackers }: Props) {
  const updateTrackers = useNotebook((s) => s.updateTrackers);

  const toggleFeatureUse = useCallback(
    (featureId: string, maxUses: number, n: number) => {
      void updateTrackers(characterId, (t) => {
        const used = t.usedFeatures[featureId] ?? 0;
        const next = used === n ? n - 1 : n;
        const usedFeatures = { ...t.usedFeatures };
        if (next === 0) {
          delete usedFeatures[featureId];
        } else {
          usedFeatures[featureId] = Math.min(next, maxUses);
        }
        return { ...t, usedFeatures };
      });
    },
    [characterId, updateTrackers],
  );

  // Group features by source
  const groups = new Map<string, typeof sheet.features>();
  for (const feat of sheet.features) {
    const arr = groups.get(feat.source) ?? [];
    arr.push(feat);
    groups.set(feat.source, arr);
  }

  return (
    <div className="sheet-template features">
      {[...groups.entries()].map(([source, feats]) => (
        <div key={source} className="sh-feat-group">
          <div className="sh-section-title lbl">{source}</div>
          {feats.map((feat) => {
            const usedCount = trackers.usedFeatures[feat.id] ?? 0;
            return (
              <div key={feat.id} className="sh-feat">
                <div className="sh-feat-header">
                  <span className="sh-feat-name mid">{feat.name}</span>
                  {feat.uses && (
                    <div className="sh-feat-uses">
                      {Array.from({ length: feat.uses.max }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          className={`bub-btn ${usedCount >= n ? "filled" : ""}`}
                          onClick={() => toggleFeatureUse(feat.id, feat.uses!.max, n)}
                          aria-label={`${feat.name} use ${n}`}
                        />
                      ))}
                      <span className="lbl sh-feat-restore">
                        {feat.uses.restoreOn === "long" ? "Long rest" : "Short rest"}
                        {feat.uses.partialRestoreOn === "short" && feat.uses.partialAmount
                          ? ` (+${feat.uses.partialAmount} short)`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
                {feat.description && (
                  <div className="sh-feat-desc">{feat.description}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
