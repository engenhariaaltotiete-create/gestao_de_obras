import {
  useMemo,
  useState,
} from "react";

import {
  normalizeText,
} from "../lib/helpers";

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  required?: boolean;
  placeholder?: string;
  allowCustom?: boolean;
  onChange: (value: string) => void;
};

export function EditableListInput({
  label,
  value,
  options,
  required,
  placeholder,
  allowCustom = true,
  onChange,
}: Props) {
  const [
    open,
    setOpen,
  ] = useState(false);

  const filtered = useMemo(() => {
    const query =
      normalizeText(value.trim());

    return (
      query
        ? options.filter(
            (option) =>
              normalizeText(option)
                .includes(query),
          )
        : [...options]
    ).slice(0, 60);
  }, [options, value]);

  return (
    <label className="field smart-list-field">
      <span>
        {label}

        {required && (
          <b className="required">
            {" "}*
          </b>
        )}
      </span>

      <div className="smart-list">
        <input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          onFocus={() =>
            setOpen(true)
          }
          onChange={(event) => {
            onChange(
              event.target.value,
            );
            setOpen(true);
          }}
          onBlur={() =>
            window.setTimeout(
              () => {
                setOpen(false);

                if (
                  !allowCustom &&
                  value &&
                  !options.some(
                    (option) =>
                      normalizeText(
                        option,
                      ) ===
                      normalizeText(
                        value,
                      ),
                  )
                ) {
                  onChange("");
                }
              },
              160,
            )
          }
        />

        {open && (
          <div className="service-menu smart-menu">
            {filtered.length ? (
              filtered.map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) =>
                      event.preventDefault()
                    }
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  >
                    {option}
                  </button>
                ),
              )
            ) : (
              <div className="service-empty">
                {allowCustom
                  ? "Nenhuma opção existente. O valor digitado será aceito."
                  : "Nenhuma opção encontrada."}
              </div>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
