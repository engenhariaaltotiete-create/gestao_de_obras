import { useMemo } from "react";

import {
  normalizeText,
} from "../lib/helpers";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  memoryKey: string;
};

const key = (
  memoryKey: string,
) =>
  `relatorios_text_memory_${memoryKey}`;

function load(
  memoryKey: string,
): string[] {
  try {
    return JSON.parse(
      localStorage.getItem(
        key(memoryKey),
      ) || "[]",
    );
  } catch {
    return [];
  }
}

function save(
  memoryKey: string,
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return;
  }

  const values = [
    text,
    ...load(memoryKey).filter(
      (previous) =>
        normalizeText(previous) !==
        normalizeText(text),
    ),
  ].slice(0, 30);

  localStorage.setItem(
    key(memoryKey),
    JSON.stringify(values),
  );
}

export function MemoryTextInput({
  label,
  value,
  onChange,
  required,
  placeholder,
  memoryKey,
}: Props) {
  const id =
    `memory_${
      memoryKey.replace(
        /[^a-z0-9]/gi,
        "_",
      )
    }`;

  const options = useMemo(
    () => load(memoryKey),
    [memoryKey, value],
  );

  return (
    <label className="field">
      <span>
        {label}

        {required && (
          <b className="required">
            {" "}*
          </b>
        )}
      </span>

      <input
        list={id}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        onBlur={(event) =>
          save(
            memoryKey,
            event.target.value,
          )
        }
      />

      <datalist id={id}>
        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
            />
          ),
        )}
      </datalist>
    </label>
  );
}
