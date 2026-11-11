"use client";

import type { OllamaModel } from "@/lib/types";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  models: OllamaModel[];
  error: string | null;
  onSelect: (model: string) => void;
}

export function ModelPicker({ models, error, onSelect }: ModelPickerProps) {
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (models.length === 0) {
    return <div className={styles.empty}>No models installed. Run `ollama pull &lt;model&gt;`.</div>;
  }

  return (
    <div className={styles.picker}>
      <p className={styles.prompt}>Choose a model to start a new chat:</p>
      <ul className={styles.list}>
        {models.map((model) => (
          <li key={model.name}>
            <button className={styles.option} onClick={() => onSelect(model.name)} type="button">
              {model.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
