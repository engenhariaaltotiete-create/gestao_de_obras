import Diagnostics from "./Diagnostics";
import { auditRows, parseAuditValue, displayAuditValue } from "./domains/auditDisplay";
import { validateWork } from "./domains/planning";
import ItemTable from "./domains/ItemTable";
import ResponsibleSelect from "./domains/ResponsibleSelect";
import AuthPassword from "./domains/AuthPassword";
import SyncIssues from "./domains/SyncIssues";
import Reports from "./domains/Reports";

import {
  startFiles,
  fileStatus,
  watchFiles,
  externalizeReportFiles,
  retryFileErrors,
} from "./domains/files";

import Budget from "./domains/Budget";
import EditableBlock from "./domains/EditableBlock";

import { Dashboard, WorkSchedule } from "./domains/Schedule";

import UserAdmin from "./domains/UserAdmin";

import {
  configureSync,
  enqueueWork,
  cachedWorks,
  mergeRemote,
  observeSync,
  startSync,
  retryErrors,
  type SyncState,
} from "./sync";

import { useEffect, useMemo, useState } from "react";

import {
  Building2,
  HardHat,
  ClipboardList,
  Users,
  ShieldCheck,
  LogOut,
  Plus,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Trash2,
  Save,
  UserRound,
  Check,
  Menu,
  X,
  FileText,
  ExternalLink,
} from "lucide-react";

import MapEditor from "./MapEditor";

import {
  STAGES,
  isChecklist,
  executionStage,
  STAGE_STATUS,
  DOC_STATUS,
  MUNICIPIOS,
  SERVICOS,
  OBJETIVOS,
  PAVIMENTOS,
  newWork,
  finished,
  progress,
  calculatedLength,
  effectiveLength,
  executionPercent,
  budgetTotal,
  syncStages,
  executionStatus,
  statusColor,
  overdue,
  money,
  meters,
  normalize,
  type Work,
  type Item,
  type User,
  type Audit,
} from "./model";

import {
  supabase,
  demoUser,
  loadWorks,
  persistWork,
  removeWork,
  loadUsers,
  loadAudit,
  auditChanges,
  authenticatedProfile,
  initialAuthPasswordFlow,
} from "./data";

type Page =
  "dashboard" | "obras" | "carteira" | "usuarios" | "auditoria" | "obra" | "diagnosticos" | "dashboard-diagnosticos";

type Filters = {
  workIds: string[];
  requester: string[];
  priority: string[];
  city: string[];
  service: string[];
  ae: string[];
  goal: string[];
  method: string[];
  pavement: string[];
  responsible: string[];
  stage: string[];
  document: string[];
  status: string[];
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  statusFrom: string;
  statusTo: string;
};

const emptyFilters = (): Filters => ({
  workIds: [],
  requester: [],
  priority: [],
  city: [],
  service: [],
  ae: [],
  goal: [],
  method: [],
  pavement: [],
  responsible: [],
  stage: [],
  document: [],
  status: [],
  startFrom: "",
  startTo: "",
  endFrom: "",
  endTo: "",
  statusFrom: "",
  statusTo: "",
});

const displayDate = (value: string) =>
  value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")
    : "—";

function Pill({ status, end }: { status: string; end?: string }) {
  return (
    <span
      className={"pill " + statusColor(status, end)}
      title={end && overdue(status, end) ? "Prazo vencido — " + status : ""}
    >
      {status}
    </span>
  );
}

function Progress({ value }: { value: number | null }) {
  return (
    <span
      className={
        "progress " +
        (value === 100
          ? "green"
          : value !== null && value < 40
            ? "red"
            : "blue")
      }
    >
      {value === null ? "N/A" : Number(value.toFixed(1)) + "%"}
    </span>
  );
}

// Use the same visible work code as the Obras listing in work filters.
const workFilterLabel = (works: Work[], work: Work) =>
  `OB-${String(works.indexOf(work) + 1).padStart(4, "0")}`;

function Multi({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <div className="multi">
      <label>{label}</label>

      <button
        className="multi-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        {value.length ? value.join(", ") : "Todos"} <ChevronDown size={13} />
      </button>

      {open && (
        <div className="multi-options">
          <input
            placeholder="Pesquisar..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {options
            .filter((option) => normalize(option).includes(normalize(search)))
            .map((option) => (
              <label key={option} className="checkrow">
                <input
                  type="checkbox"
                  checked={value.includes(option)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, option]
                        : value.filter((selected) => selected !== option),
                    )
                  }
                />
                {option}
              </label>
            ))}

          <button onClick={() => setOpen(false)}>Concluir</button>
        </div>
      )}
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  filters,
  setFilters,
  users,
  showAdvanced = true,
  dashboardMode = false,
  works,
}: {
  query: string;
  setQuery: (value: string) => void;
  filters: Filters;
  setFilters: (value: Filters) => void;
  users: User[];
  showAdvanced?: boolean;
  dashboardMode?: boolean;
  works: Work[];
}) {
  const [open, setOpen] = useState(false);

  const count = Object.values(filters).reduce(
    (total, value) =>
      total + (Array.isArray(value) ? value.length : value ? 1 : 0),
    0,
  );

  const set = (key: keyof Filters, value: string[] | string) =>
    setFilters({
      ...filters,
      [key]: value,
    });

  return (
    <div className="filters">
      <div className="searchrow">
        <div className="searchbox">
          <Search size={17} />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar em todos os campos..."
          />
        </div>

        {showAdvanced && (
          <button
            onClick={() => setOpen((current) => !current)}
            className="filter-button"
          >
            <SlidersHorizontal size={15} /> Filtros{" "}
            {count > 0 && <span className="counter">{count}</span>}
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {count > 0 && (
        <div className="filter-chips">
          {Object.entries(filters).flatMap(([key, value]) =>
            Array.isArray(value)
              ? value.map((selected) => (
                  <button
                    key={key + selected}
                    onClick={() =>
                      set(
                        key as keyof Filters,
                        value.filter((item) => item !== selected),
                      )
                    }
                  >
                    {selected} ×
                  </button>
                ))
              : value
                ? [
                    <button
                      key={key}
                      onClick={() => set(key as keyof Filters, "")}
                    >
                      {key}: {value} ×
                    </button>,
                  ]
                : [],
          )}

          <button className="clear" onClick={() => setFilters(emptyFilters())}>
            Limpar todos
          </button>
        </div>
      )}

      {open && (
        <div className="filter-panel">
          <div className="filter-grid">
            <Multi
              label="Obra"
              options={works.map((w) => workFilterLabel(works, w)).sort((a,b) => a.localeCompare(b,"pt-BR"))}
              value={works.filter((w) => filters.workIds.includes(w.id)).map((w) => workFilterLabel(works, w))}
              onChange={(values) => set("workIds", works.filter((w) => values.includes(workFilterLabel(works, w))).map((w) => w.id))}
            />
            {!dashboardMode && <Multi
              label="Solicitante"
              options={[
                ...new Map(
                  works
                    .map((w) => w.requester.trim())
                    .filter(Boolean)
                    .map((value) => [normalize(value), value]),
                ).values(),
              ].sort((a, b) => a.localeCompare(b, "pt-BR"))}
              value={filters.requester}
              onChange={(value) => set("requester", value)}
            />}
            <Multi
              label="Prioridade"
              options={["Baixa", "Média", "Alta"]}
              value={filters.priority}
              onChange={(value) => set("priority", value)}
            />

            <Multi
              label="Município"
              options={MUNICIPIOS}
              value={filters.city}
              onChange={(value) => set("city", value)}
            />

            <Multi
              label="Serviço"
              options={SERVICOS}
              value={filters.service}
              onChange={(value) => set("service", value)}
            />

            <Multi
              label="A/E"
              options={["Água", "Esgoto"]}
              value={filters.ae}
              onChange={(value) => set("ae", value)}
            />

            <Multi
              label="Objetivo"
              options={OBJETIVOS}
              value={filters.goal}
              onChange={(value) => set("goal", value)}
            />

            <Multi
              label="Método"
              options={["VCA", "MND"]}
              value={filters.method}
              onChange={(value) => set("method", value)}
            />

            <Multi
              label="Pavimento"
              options={PAVIMENTOS}
              value={filters.pavement}
              onChange={(value) => set("pavement", value)}
            />

            {!dashboardMode && <Multi
              label="Responsável"
              options={[
                "Sem responsável",
                ...users.filter((user) => user.active).map((user) => user.name),
              ]}
              value={filters.responsible}
              onChange={(value) => set("responsible", value)}
            />}

            {!dashboardMode && <Multi
              label="Etapa"
              options={[...STAGES]}
              value={filters.stage}
              onChange={(value) => set("stage", value)}
            />}

            {!dashboardMode && <Multi
              label="Documento"
              options={[...newWork().startDocs, ...newWork().endDocs].map(
                (doc) => doc.name,
              )}
              value={filters.document}
              onChange={(value) => set("document", value)}
            />}

            <Multi
              label="Status"
              options={[...STAGE_STATUS]}
              value={filters.status}
              onChange={(value) => set("status", value)}
            />
          </div>

          <div className="date-grid">
            {[
              ["Previsão de início", "startFrom", "startTo"],
              ["Previsão de término", "endFrom", "endTo"],
              ...(!dashboardMode ? [["Data Status", "statusFrom", "statusTo"]] : []),
            ].map(([name, from, to]) => (
              <div key={name}>
                <label>{name} (de / até)</label>

                <div className="datepair">
                  <input
                    type="date"
                    value={filters[from as keyof Filters] as string}
                    onChange={(event) =>
                      set(from as keyof Filters, event.target.value)
                    }
                  />

                  <input
                    type="date"
                    value={filters[to as keyof Filters] as string}
                    onChange={(event) =>
                      set(to as keyof Filters, event.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="right">
            <button onClick={() => setFilters(emptyFilters())}>
              Limpar filtros
            </button>

            <button className="primary" onClick={() => setOpen(false)}>
              Aplicar e recolher
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fieldMatch(
  work: Work,
  filters: Filters,
  users: User[],
  items: Item[],
) {
  const has = (selected: string[], value: string) =>
    !selected.length || selected.includes(value);

  const all = [...work.stages, ...work.startDocs, ...work.endDocs];

  const selected = items.length ? items : all;

  const responsibleName = (item: Item) =>
    users.find((user) => user.id === item.responsible)?.name || "";

  const inRange = (value: string, from: string, to: string) =>
    (!from && !to) ||
    (!!value &&
      (!from || value.slice(0, 10) >= from) &&
      (!to || value.slice(0, 10) <= to));

  return (
    (!filters.workIds.length || filters.workIds.includes(work.id)) &&
    (!filters.requester.length ||
      filters.requester.some(
        (value) => normalize(value) === normalize(work.requester.trim()),
      )) &&
    has(filters.priority, work.priority) &&
    has(filters.city, work.city) &&
    has(filters.service, work.service) &&
    has(filters.ae, work.ae) &&
    has(filters.goal, work.goal) &&
    has(filters.method, work.method) &&
    (!filters.pavement.length ||
      work.pavements.some((pavement) =>
        filters.pavement.includes(pavement.type),
      )) &&
    (!filters.responsible.length ||
      selected.some(
        (item) =>
          filters.responsible.includes(responsibleName(item)) ||
          (!item.responsible &&
            filters.responsible.includes("Sem responsável")),
      )) &&
    (!filters.stage.length ||
      work.stages.some((item) => filters.stage.includes(item.name))) &&
    (!filters.document.length ||
      [...work.startDocs, ...work.endDocs].some((item) =>
        filters.document.includes(item.name),
      )) &&
    (!filters.status.length ||
      selected.some((item) => filters.status.includes(item.status))) &&
    ((!filters.startFrom && !filters.startTo) ||
      selected.some((item) =>
        inRange(item.start, filters.startFrom, filters.startTo),
      )) &&
    ((!filters.endFrom && !filters.endTo) ||
      selected.some((item) =>
        inRange(item.end, filters.endFrom, filters.endTo),
      )) &&
    ((!filters.statusFrom && !filters.statusTo) ||
      selected.some((item) =>
        inRange(item.statusAt, filters.statusFrom, filters.statusTo),
      ))
  );
}

function matchesQuery(
  work: Work,
  query: string,
  users: User[],
  items: Item[] = [],
) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return true;
  }

  const haystack = normalize(
    JSON.stringify({
      ...work,
      stages: items.length ? items : work.stages,
      startDocs: items.length ? [] : work.startDocs,
      endDocs: items.length ? [] : work.endDocs,
    }) +
      " " +
      users.map((user) => user.name).join(" "),
  );

  return terms.every((term) => haystack.includes(term));
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      return onDemo();
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="logo">
          <Building2 size={29} />
        </div>

        <div>
          <strong>
            SISTEMA DE
            <br />
            GESTÃO DE OBRAS
          </strong>

          <small>Infraestrutura de Água e Esgoto</small>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <h2>Acesse sua conta</h2>
        <p>Entre com suas credenciais para continuar</p>

        <label>E-mail</label>

        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="seu@email.com"
        />

        <label>Senha</label>

        <input
          type="password"
          required={!!supabase}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Sua senha"
        />

        {error && <div className="error">{error}</div>}

        {supabase && (
          <button
            type="button"
            className="link"
            onClick={async () => {
              if (!email) {
                setError("Informe seu e-mail.");
                return;
              }

              if (!supabase) {
                return;
              }

              const { error } = await supabase.auth.resetPasswordForEmail(
                email,
                {
                  redirectTo: new URL(".", location.href).href,
                },
              );

              setError(
                error
                  ? error.message
                  : "Se o e-mail estiver cadastrado, você receberá as instruções.",
              );
            }}
          >
            Esqueceu sua senha?
          </button>
        )}

        <button className="primary login-submit" disabled={loading}>
          {loading
            ? "Entrando..."
            : supabase
              ? "Entrar"
              : "Entrar em demonstração"}
        </button>

        {!supabase && (
          <p className="demo-notice">
            Modo local de demonstração. Configure o Supabase para autenticação
            real e dados compartilhados.
          </p>
        )}
      </form>
    </div>
  );
}

function PhotoReportsBlock({
  work,
  users,
  admin,
  save,
}: {
  work: Work;
  users: User[];
  admin: boolean;
  save: (work: Work) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Work>(work);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(work);
  }, [work]);
  const persist = async () => {
    try {
      await save({ ...work, reports: draft.reports });
      setError("");
    } catch (failure) {
      setError(String(failure));
    }
  };
  return (
    <>
      <Reports
        work={draft}
        users={users}
        admin={admin}
        editing={true}
        update={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSaveDraft={persist}
        onConclude={async (id) => {
          const updated = {
            ...work,
            reports: draft.reports.map((item) =>
              item.id === id ? { ...item, status: "CONCLUÍDO" as const } : item,
            ),
          };
          await save(updated);
          setDraft(updated);
        }}
      />
      {error && <p className="error">{error}</p>}
    </>
  );
}

function WorkForm({
  work,
  update,
}: {
  work: Work;
  update: (patch: Partial<Work>) => void;
}) {
  const input = (label: string, key: keyof Work, type = "text") => (
    <div className="form-field">
      <label htmlFor={"work-" + key}>
        {label}
        {key !== "createdAt" && <span className="required-star">*</span>}
      </label>

      <input
        id={"work-" + key}
        aria-label={label}
        required
        min={type === "number" ? 0 : undefined}
        readOnly={key === "createdAt"}
        type={type}
        value={
          key === "createdAt"
            ? new Date(work.createdAt).toLocaleDateString("pt-BR")
            : String(work[key] ?? "")
        }
        onChange={(event) =>
          update({
            [key]:
              type === "number"
                ? Number(event.target.value)
                : event.target.value,
          })
        }
      />
    </div>
  );

  const select = (label: string, key: keyof Work, options: string[]) => (
    <div className="form-field">
      <label htmlFor={"work-" + key}>
        {label}
        <span className="required-star">*</span>
      </label>

      <select
        id={"work-" + key}
        aria-label={label}
        value={String(work[key])}
        onChange={(event) =>
          update({
            [key]: event.target.value,
          })
        }
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="form-grid">
      {input("Data de cadastro", "createdAt")}
      {input("Endereço", "address")}
      {input("Bairro", "district")}

      {select("Município", "city", [...new Set([...MUNICIPIOS, work.city])])}

      {select("Objetivo", "goal", [...new Set([...OBJETIVOS, work.goal])])}

      {input("Solicitante", "requester")}
      {input("Documento de solicitação", "requestDocument")}

      {select("Tipo de obra", "kind", ["Linear", "Pontual"])}

      {select("A/E", "ae", ["Água", "Esgoto"])}
      {select("Serviço", "service", SERVICOS)}
      {select("Método", "method", ["VCA", "MND"])}

      {select("Prioridade", "priority", ["Baixa", "Média", "Alta"])}

      {input("Lig.", "links", "number")}
      {input("PNG", "png", "number")}
      {input("Booster/EEE", "booster", "number")}
      {input("VRP", "vrp", "number")}

      <div className="form-field">
        <label>Extensão calculada (m)</label>

        <input disabled value={meters(calculatedLength(work))} />
      </div>

      <div className="form-field wide">
        <label>Informações relevantes</label>

        <textarea
          value={work.notes}
          onChange={(event) =>
            update({
              notes: event.target.value,
            })
          }
        />
      </div>

      <div className="wide">
        <strong>
          Pavimentos <span className="required-star">*</span>
        </strong>

        <div className="pavement-grid">
          {PAVIMENTOS.map((type) => {
            const pavement = work.pavements.find((item) => item.type === type);

            return (
              <div className="pavement" key={type}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!pavement}
                    onChange={(event) =>
                      update({
                        pavements: event.target.checked
                          ? [...work.pavements, { type, length: 0 }]
                          : work.pavements.filter((item) => item.type !== type),
                      })
                    }
                  />
                  {type}
                </label>

                {pavement && (
                  <input
                    type="number"
                    min="0"
                    value={pavement.length}
                    onChange={(event) =>
                      update({
                        pavements: work.pavements.map((item) =>
                          item.type === type
                            ? {
                                ...item,
                                length: Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                    placeholder="Extensão (m)"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [passwordFlow, setPasswordFlow] = useState(initialAuthPasswordFlow);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [navExpanded, setNavExpanded] = useState<Record<string, boolean>>({});
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFiltersOpen, setAuditFiltersOpen] = useState(false);
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [auditTableFilter, setAuditTableFilter] = useState("");
  const [auditFieldFilter, setAuditFieldFilter] = useState("");
  const [auditDateFilter, setAuditDateFilter] = useState("");
  const auditViewRows = useMemo(() => [...audit]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .flatMap((entry) => {
      const who = users.find(u => u.id === entry.actor)?.name || entry.actor || "Usuário não identificado";
      const when = new Date(entry.at).toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
      const table = entry.entity === "obras" ? "Obras" : entry.entity === "profiles" ? "Usuários" : entry.entity === "drive_files" ? "Arquivos" : entry.entity;
      const record = entry.workId ? works.find(w => w.id === entry.workId)?.address || entry.workId.slice(0,8) : entry.entityId?.slice(0,8) || "";
      return auditRows(entry.field, parseAuditValue(entry.before), parseAuditValue(entry.after)).map((change, index) => ({
        key: `${entry.id}-${index}`, who, when, date: when.slice(0,10), table,
        field: change.path.split(" — ").at(-1) || change.path,
        what: [table, record, change.path].filter(Boolean).join(" · "),
        before: displayAuditValue(change.before), after: displayAuditValue(change.after)
      }));
    }), [audit, users, works]);
  const auditOptions = (key: "who" | "table" | "field" | "date") =>
    [...new Set(auditViewRows.map(row => row[key]))].filter(Boolean).sort((a,b) => a.localeCompare(b,"pt-BR"));
  const visibleAuditRows = auditViewRows.filter(row => {
    if (auditUserFilter && row.who !== auditUserFilter) return false;
    if (auditTableFilter && row.table !== auditTableFilter) return false;
    if (auditFieldFilter && row.field !== auditFieldFilter) return false;
    if (auditDateFilter && row.date !== auditDateFilter) return false;
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    return normalize([row.who,row.when,row.what,row.before,row.after].join(" ")).includes(normalize(auditSearch.trim()));
  });
  const auditActiveFilters = [auditUserFilter,auditTableFilter,auditFieldFilter,auditDateFilter].filter(Boolean).length;
  const [page, setPage] = useState<Page>("obras");
  const [selected, setSelected] = useState<string | null>(null);
  const [workOrigin, setWorkOrigin] = useState<"dashboard" | "obras" | "carteira">("obras");
  const [query, setQuery] = useState("");
  const [portfolioWorkIds, setPortfolioWorkIds] = useState<string[]>([]);
  const [portfolioGroup, setPortfolioGroup] = useState("all");
  const [portfolioActivity, setPortfolioActivity] = useState("all");
  const [portfolioStatus, setPortfolioStatus] = useState("all");
  const [portfolioResponsible, setPortfolioResponsible] = useState("all");
  const [portfolioDateKind, setPortfolioDateKind] = useState("end");
  const [portfolioFrom, setPortfolioFrom] = useState("");
  const [portfolioTo, setPortfolioTo] = useState("");
  const [portfolioQuick, setPortfolioQuick] = useState("all");
  const [portfolioFiltersOpen, setPortfolioFiltersOpen] = useState(false);
  const [appliedPortfolio, setAppliedPortfolio] = useState({
    workIds: [] as string[],
    group: "all", activity: "all", status: "all", responsible: "all",
    dateKind: "end", from: "", to: "", quick: "all",
  });


  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [cardFilter, setCardFilter] = useState("");
  const [myPortfolio, setMyPortfolio] = useState(false);
  const [openBlocks, setOpenBlocks] = useState<string[]>([]);
  const [editItem, setEditItem] = useState<{
    workId: string;
    kind: "stages" | "startDocs" | "endDocs";
    id: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [visible, setVisible] = useState(50);
  const [fileState, setFileState] = useState({
    pending: 0,
    errors: [] as string[],
  });
  const [syncState, setSyncState] = useState<SyncState>({
    pending: 0,
    errors: 0,
    syncing: false,
    offline: !navigator.onLine,
  });

  useEffect(() => {
    const refresh = () => void fileStatus().then(setFileState);
    const stopFiles = startFiles();
    const stopWatch = watchFiles(refresh);
    refresh();

    return () => {
      stopFiles();
      stopWatch();
    };
  }, [user?.id]);

  useEffect(() => {
    const stop = observeSync(setSyncState);
    const stopSync = startSync();

    return () => {
      stop();
      stopSync();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let alive = true;
    const refresh = () => {
      void authenticatedProfile()
        .then((profile) => {
          if (alive) {
            configureSync(profile?.active ? profile.id : "");
            setUser(profile);
          }
        })
        .catch((e) => {
          if (alive) {
            setError("Não foi possível verificar seu perfil: " + String(e));
          }
        });
    };

    refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPasswordFlow(true);
      setTimeout(refresh, 0);
    });

    const timer = setInterval(refresh, 60000);

    return () => {
      alive = false;
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!user?.active) return;

    configureSync(user.id);
    let alive = true;
    setBusy(true);

    if (supabase) {
      cachedWorks()
        .then((w) => {
          if (alive) setWorks(w);
        })
        .catch((e) => {
          if (alive) {
            setError("Falha no armazenamento local: " + String(e));
          }
        });
    }

    Promise.all([loadWorks(), loadUsers(), loadAudit()])
      .then(async ([w, u, a]) => {
        if (!alive) return;

        const merged = supabase
          ? await mergeRemote(
              w.map((x) => ({
                id: x.id,
                payload: x,
                revision: (x as Work & { __revision?: number }).__revision ?? 1,
              })),
            )
          : w;

        if (!alive) return;

        setWorks(merged);
        setUsers(u);
        setAudit(a);

        const actual = u.find((x) => x.id === user.id);
        if (actual) {
          setUser((prev) =>
            prev && JSON.stringify(prev) !== JSON.stringify(actual)
              ? actual
              : prev,
          );
        }
      })
      .catch((e) => {
        if (alive) {
          setError(
            "Sem conexão com o servidor; os dados locais permanecem disponíveis. " +
              String(e.message || e),
          );
        }
      })
      .finally(() => {
        if (alive) setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const save = async (next: Work, previous?: Work) => {
    try {
      const w = syncStages(await externalizeReportFiles(next, users, previous));

      if (supabase) await enqueueWork(w);
      else await persistWork(w);

      auditChanges(previous, w, user?.id || "");

      setWorks((v) =>
        v.some((x) => x.id === w.id)
          ? v.map((x) => (x.id === w.id ? w : x))
          : [w, ...v],
      );
    } catch (e) {
      setError("Não foi possível gravar no dispositivo: " + String(e));
      throw e;
    }
  };

  const changeItem = (
    w: Work,
    kind: "stages" | "startDocs" | "endDocs",
    id: string,
    patch: Partial<Item>,
  ) => {
    const items = w[kind].map((i) => {
      if (i.id !== id) return i;

      const next = { ...i, ...patch };

      if (
        next.status === "CADASTRADO" &&
        ![
          "Checklist de Início de Obra",
          "Checklist de Conclusão de Obra",
        ].includes(i.name)
      ) {
        setError(
          "Selecione um status diferente de CADASTRADO antes de editar.",
        );
        return i;
      }

      if (patch.status && patch.status !== i.status) {
        next.statusAt = new Date().toISOString();
      }

      if (next.start && next.end && next.end < next.start) {
        setError(
          "A previsão de término deve ser igual ou posterior à de início.",
        );
        return i;
      }

      return next;
    });

    void save({ ...w, [kind]: items }, w).catch(() => {});
  };

  const current = works.find((w) => w.id === selected);

  const totals = useMemo(() => {
    const groups = [
      ["Total de obras", () => true],
      ["Em execução", (w: Work) => executionStatus(w) === "EM ANDAMENTO"],
      ["Concluídas", (w: Work) => executionStatus(w) === "CONCLUÍDO"],
      [
        "Carteira",
        (w: Work) =>
          ["LIBERADO", "EM PLANEJAMENTO"].includes(executionStatus(w)),
      ],
      [
        "Em liberação",
        (w: Work) =>
          ["CADASTRADO", "AGUARDANDO", "PARALISADO"].includes(
            executionStatus(w),
          ),
      ],
    ] as const;

    return groups.map(([name, fn]) => {
      const ws = works.filter(fn);

      return {
        name,
        count: ws.length,
        length: ws.reduce((n, w) => n + effectiveLength(w), 0),
        links: ws.reduce((n, w) => n + w.links, 0),
      };
    });
  }, [works]);

  const allItems = useMemo(
    () =>
      works.flatMap((w) => [
        {
          w,
          kind: "stages" as const,
          items: w.stages.filter(
            (i) => !isChecklist(i.name) && !finished(i.status),
          ),
        },
        {
          w,
          kind: "startDocs" as const,
          items: w.startDocs.filter((i) => !finished(i.status)),
        },
        {
          w,
          kind: "endDocs" as const,
          items: w.endDocs.filter((i) => !finished(i.status)),
        },
      ]),
    [works],
  );

  const portfolioNames = useMemo(() =>
    [...new Set(allItems.flatMap((g) =>
      (portfolioGroup === "all" || portfolioGroup === g.kind)
        ? g.items.map((i) => i.name) : []))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [allItems, portfolioGroup],
  );
  const portfolioStatuses = useMemo(() =>
    [...new Set(allItems.flatMap((g) => g.items.map((i) => i.status)))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [allItems],
  );
  const portfolioResponsibles = useMemo(() =>
    [...new Set(allItems.flatMap((g) => g.items.map((i) => i.responsible).filter(Boolean)))],
    [allItems],
  );
  const portfolioMatch = (kind: string, i: Item) => {
    const f = appliedPortfolio;
    if (f.group !== "all" && f.group !== kind) return false;
    if (f.activity !== "all" && f.activity !== i.name) return false;
    if (f.status !== "all" && f.status !== i.status) return false;
    if (f.responsible !== "all" &&
        (f.responsible === "__empty" ? !!i.responsible : i.responsible !== f.responsible)) return false;
    const date = f.dateKind === "start" ? i.start : f.dateKind === "status" ? i.statusAt : i.end;
    const day = date?.slice(0, 10) || "";
    if (f.from && (!day || day < f.from)) return false;
    if (f.to && (!day || day > f.to)) return false;
    if (f.quick === "unassigned" && !!i.responsible) return false;
    if (f.quick === "progress" && i.status !== "EM ANDAMENTO") return false;
    const today = new Date().toISOString().slice(0, 10);
    const completed = ["CONCLUÍDO", "CANCELADO", "NÃO SE APLICA"].includes(i.status);
    if (f.quick === "overdue" && (completed || !i.end || i.end >= today)) return false;
    if (f.quick === "week") {
      const limit = new Date();
      limit.setDate(limit.getDate() + 7);
      if (completed || !i.end || i.end < today || i.end > limit.toISOString().slice(0, 10)) return false;
    }
    return true;
  };
  const portfolioActiveFilters = [appliedPortfolio.group, appliedPortfolio.activity,
    appliedPortfolio.status, appliedPortfolio.responsible, appliedPortfolio.quick]
    .filter(value => value !== "all").length + appliedPortfolio.workIds.length + Number(!!appliedPortfolio.from) + Number(!!appliedPortfolio.to);
  const resetPortfolioFilters = () => {
    setPortfolioWorkIds([]);
    setPortfolioGroup("all"); setPortfolioActivity("all"); setPortfolioStatus("all");
    setPortfolioResponsible("all"); setPortfolioDateKind("end");
    setPortfolioFrom(""); setPortfolioTo(""); setPortfolioQuick("all");
    setAppliedPortfolio({workIds: [], group:"all", activity:"all", status:"all", responsible:"all",
      dateKind:"end", from:"", to:"", quick:"all"});
  };

  const portfolio = useMemo(
    () =>
      allItems.map((group) => ({
        ...group,
        items: group.items.filter(
          (i) =>
            (!appliedPortfolio.workIds.length || appliedPortfolio.workIds.includes(group.w.id)) &&
            (!myPortfolio || i.responsible === user?.id) &&
            matchesQuery(group.w, query, users, [i]) &&
            portfolioMatch(group.kind, i),
        ),
      })),
    [allItems, myPortfolio, user?.id, query, users, appliedPortfolio],
  );

  const activityCounts = useMemo(() => {
    const mapping: [string, number[]][] = [
      ["Diagnóstico", [0]],
      ["Estudos/Projetos", [1, 2]],
      ["Materiais", [4]],
      ["Obrasoft", [5]],
      ["Execução de obras", [6]],
      ["LIG/PNG", [7]],
      ["Reposição", [8]],
      ["Testes", [9]],
      ["Instalação de Equipamento", [10]],
    ];

    return mapping.map(([name, indices]) => ({
      name,
      count: portfolio
        .filter((g) => g.kind === "stages")
        .flatMap((g) => g.items)
        .filter((i) => indices.some((x) => STAGES[x] === i.name)).length,
    }));
  }, [portfolio]);

  const workRows = useMemo(
    () =>
      works.filter(
        (w) =>
          fieldMatch(w, page === "dashboard" ? { ...filters, status: [] } : filters, users, []) &&
          (page !== "dashboard" || !filters.status.length || filters.status.includes(executionStatus(w))) &&
          matchesQuery(w, query, users) &&
          (!cardFilter ||
            cardFilter === "Total de obras" ||
            (cardFilter === "Em execução" &&
              executionStatus(w) === "EM ANDAMENTO") ||
            (cardFilter === "Concluídas" &&
              executionStatus(w) === "CONCLUÍDO") ||
            (cardFilter === "Carteira" &&
              ["LIBERADO", "EM PLANEJAMENTO"].includes(executionStatus(w))) ||
            (cardFilter === "Em liberação" &&
              ["CADASTRADO", "AGUARDANDO", "PARALISADO"].includes(
                executionStatus(w),
              ))),
      ),
    [works, filters, users, query, cardFilter],
  );

  const navigate = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    setQuery("");
    setFilters(emptyFilters());
    setCardFilter("");
    setVisible(50);
  };

  const [pendingWork, setPendingWork] = useState<Work | null>(null);
  const [newWorkError, setNewWorkError] = useState("");
  const createWork = async () => {
    if (!pendingWork) return;
    const errors = validateWork(pendingWork);
    if (errors.length) {
      setNewWorkError(errors.join(" "));
      return;
    }
    try {
      await save({ ...pendingWork, dataValidated: true });
      setSelected(pendingWork.id);
      setOpenBlocks([]);
      setPendingWork(null);
      setNewWorkError("");
      navigate("obra");
    } catch (e) {
      setNewWorkError(String(e));
    }
  };
  const newObra = () => setPendingWork(newWork());

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();

    configureSync("");
    setUser(null);
    setWorks([]);
    setSelected(null);
  };

  if (user && !user.active) {
    return (
      <div className="login-card">
        <h2>Usuário desativado</h2>
        <button onClick={logout}>Sair</button>
      </div>
    );
  }

  if (user && passwordFlow && supabase) {
    return <AuthPassword onDone={() => setPasswordFlow(false)} />;
  }

  if (!user) {
    return (
      <Login
        onDemo={() => {
          configureSync(demoUser.id);
          setUser(demoUser);
        }}
      />
    );
  }

  const navGroups = [
    { key: "obras", title: "OBRAS", links: [
      { page: "obras" as Page, label: "Obras", icon: Building2 },
      { page: "carteira" as Page, label: "Carteira de Atividades", icon: ClipboardList },
      { page: "dashboard" as Page, label: "Dashboard de Obras", icon: Building2 },
    ] },
    { key: "diagnostico", title: "DIAGNÓSTICO", links: [
      { page: "diagnosticos" as Page, label: "Diagnósticos", icon: ClipboardList },
      { page: "dashboard-diagnosticos" as Page, label: "Dashboard de Diagnósticos", icon: ClipboardList },
    ] },
    { key: "administracao", title: "ADMINISTRAÇÃO", links: [
      ...(user.role === "admin" ? [{ page: "usuarios" as Page, label: "Usuários", icon: Users }] : []),
      { page: "auditoria" as Page, label: "Auditoria", icon: ShieldCheck },
    ] },
  ];
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobileNav ? "mobile-open" : "")}>
        <div className="brand">
          <Building2 size={24} />
          <strong>GESTÃO DE OBRAS</strong>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X />
          </button>
        </div>

        <nav>
          {navGroups.map(group => (
            <div className="nav-group" key={group.key}>
              <button className="nav-group-toggle" onClick={() => setNavExpanded(v => ({...v, [group.key]: !v[group.key]}))} aria-expanded={!!navExpanded[group.key]}>
                <span>{group.title}</span><span aria-hidden="true">{navExpanded[group.key] ? "▾" : "▸"}</span>
              </button>
              {navExpanded[group.key] && <div className="nav-group-links">{group.links.map(n => (
                <button key={n.page} className={page === n.page ? "nav-active" : ""} onClick={() => navigate(n.page)}>
                  <n.icon size={17} /><span>{n.label}</span>
                </button>
              ))}</div>}
            </div>
          ))}
          <a
            className="external-report-link"
            href="https://engenhariaaltotiete-create.github.io/Relatorios_Padrao_4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={17} /> RELATÓRIOS PADRÃO{" "}
            <ExternalLink size={14} aria-label="Sistema externo" />
          </a>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === "admin" ? "Administrador" : "Usuário"}</small>
          </div>
          <button onClick={logout} title="Sair">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>
          <span>
            {page === "dashboard-diagnosticos" ? "Dashboard de Diagnósticos" : page === "diagnosticos" ? "Diagnósticos" : page === "dashboard"
              ? "Dashboard"
              : page === "obras"
                ? "Obras"
                : page === "carteira"
                  ? "Carteira de Atividades"
                  : page === "usuarios"
                    ? "Usuários"
                    : page === "auditoria"
                      ? "Auditoria"
                      : "Detalhes da Obra"}
          </span>
          <span className="top-user">{user.name}</span>
        </header>

        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        <div className="sync-banner" role="status">
          {!supabase
            ? "Modo local"
            : syncState.offline
              ? "Offline — salvo no dispositivo"
              : syncState.syncing
                ? "Sincronizando…"
                : syncState.pending
                  ? "Aguardando sincronização"
                  : "Sincronizado"}{" "}
          · Dados: {syncState.pending} pendente(s) · Arquivos:{" "}
          {fileState.pending} pendente(s)
          {fileState.errors.length > 0 && (
            <details>
              <summary>Erros de arquivos</summary>
              <button onClick={() => void retryFileErrors()}>
                Retentar arquivos
              </button>
              {fileState.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </details>
          )}
          {syncState.errors > 0 && (
            <>
              {" "}
              · {syncState.errors} erro(s){" "}
              <button onClick={() => void retryErrors()}>
                Tentar novamente
              </button>
            </>
          )}
        </div>

        {syncState.errors > 0 && (
          <SyncIssues
            count={syncState.errors + syncState.pending}
            onRemote={(w) =>
              setWorks((v) => v.map((x) => (x.id === w.id ? w : x)))
            }
          />
        )}

        {busy && <div className="hint">Carregando dados...</div>}

        {(page === "diagnosticos" || page === "dashboard-diagnosticos") && <Diagnostics mode={page === "diagnosticos" ? "list" : "dashboard"} works={works} onOpenWork={id=>{setSelected(id);setOpenBlocks([]);setWorkOrigin("obras");setPage("obra")}} onCreateWork={work=>{setPendingWork(work);setNewWorkError("")}} />}

        {page === "dashboard" && (
          <>
            <h1 className="dashboard-main-title"><HardHat aria-hidden="true" size={25} /> DASHBOARD DE OBRAS</h1>
            <FilterBar
              query={query}
              setQuery={setQuery}
              filters={filters}
              setFilters={setFilters}
              users={users}
              works={works}
              dashboardMode
            />
            <Dashboard
              works={workRows}
              users={users}
              onOpen={(id) => {
                setWorkOrigin("dashboard");
                setSelected(id);
                setOpenBlocks([]);
                setPage("obra");
              }}
            />
          </>
        )}

        {pendingWork && (
          <div
            className="report-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cadastrar nova obra"
          >
            <div className="report-modal-content">
              <div className="report-modal-header">
                <h2>Nova obra — dados obrigatórios</h2>
                <button onClick={() => setPendingWork(null)}>Cancelar</button>
              </div>
              <WorkForm
                work={pendingWork}
                update={(patch) =>
                  setPendingWork((current) =>
                    current ? { ...current, ...patch } : null,
                  )
                }
              />
              {newWorkError && <p className="error">{newWorkError}</p>}
              <button className="primary" onClick={() => void createWork()}>
                Criar obra
              </button>
            </div>
          </div>
        )}
        {page === "obras" && (
          <>
            <div className="page-heading">
              <div>
                <h1>Obras</h1>
                <p>Acompanhamento de todas as obras cadastradas</p>
              </div>
              <button className="primary" onClick={newObra}>
                <Plus size={16} /> Nova Obra
              </button>
            </div>

            <div className="kpis five">
              {totals.map((t, i) => (
                <button
                  key={t.name}
                  className={"kpi " + (cardFilter === t.name ? "chosen" : "")}
                  onClick={() =>
                    setCardFilter((v) => (v === t.name ? "" : t.name))
                  }
                >
                  <span className={"kpi-icon kpi-" + i}>
                    <Building2 size={19} />
                  </span>
                  <span>
                    <small>{t.name}</small>
                    <strong>{t.count} obras</strong>
                    <b>
                      {meters(t.length)} m · {t.links} ligações
                    </b>
                  </span>
                </button>
              ))}
            </div>

            <FilterBar
              query={query}
              setQuery={setQuery}
              filters={filters}
              setFilters={setFilters}
              users={users}
              works={works}
            />

            <div className="table-scroll">
              <table className="works-table">
                <thead>
                  <tr>
                    <th>Obra</th>
                    <th>Município</th>
                    <th>Endereço</th>
                    <th>Objetivo</th>
                    <th>Serviço</th>
                    <th>A/E</th>
                    <th>Ext (m)</th>
                    <th>Lig.</th>
                    <th>PNG</th>
                    <th>Orçamento</th>
                    <th>Exec.</th>
                    <th>Etapas</th>
                    <th>Check início</th>
                    <th>Check conclusão</th>
                    <th>Status Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {workRows.slice(0, visible).map((w) => (
                    <tr
                      key={w.id}
                      className="work-row"
                      onClick={() => {
                        setWorkOrigin("obras");
                        setSelected(w.id);
                        setOpenBlocks([]);
                        setPage("obra");
                      }}
                    >
                      <td>
                        <strong>
                          OB-
                          {String(works.indexOf(w) + 1).padStart(4, "0")}
                        </strong>
                      </td>
                      <td>{w.city}</td>
                      <td>{w.address || "Sem endereço"}</td>
                      <td>{w.goal}</td>
                      <td>{w.service}</td>
                      <td>{w.ae}</td>
                      <td>{meters(effectiveLength(w))}</td>
                      <td>{w.links}</td>
                      <td>{w.png}</td>
                      <td>{money(budgetTotal(w))}</td>
                      <td>
                        <Progress value={executionPercent(w)} />
                      </td>
                      <td>
                        <Progress value={progress(w.stages)} />
                      </td>
                      <td>
                        <Progress value={progress(w.startDocs)} />
                      </td>
                      <td>
                        <Progress value={progress(w.endDocs)} />
                      </td>
                      <td>
                        <Pill
                          status={executionStatus(w)}
                          end={executionStage(w)?.end}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="list-bottom">
              Exibindo {Math.min(visible, workRows.length)} de {workRows.length}{" "}
              obras{" "}
              {visible < workRows.length && (
                <button onClick={() => setVisible((x) => x + 50)}>
                  Carregar mais 50
                </button>
              )}
            </div>
          </>
        )}

        {page === "carteira" && (
          <>
            <div className="page-heading">
              <div>
                <h1>Carteira de Atividades</h1>
                <p>Etapas e documentos pendentes de todas as obras</p>
              </div>
              <button
                className={"toggle-button " + (myPortfolio ? "on" : "")}
                onClick={() => setMyPortfolio((x) => !x)}
              >
                <UserRound size={16} /> Minha Carteira{" "}
                <span>{myPortfolio ? "ATIVA" : "DESATIVADA"}</span>
              </button>
            </div>

            <div className="kpis seven portfolio-kpis">
              {activityCounts.map((x) => (
                <div className="kpi" key={x.name}>
                  <span className="kpi-icon"><ClipboardList size={19} aria-hidden="true" /></span>
                  <span>
                    <small>{x.name}</small>
                    <strong>{x.count}</strong>
                  </span>
                </div>
              ))}
            </div>

            <div className="portfolio-alert">
              <strong>
                {portfolio.reduce(
                  (n, g) => n + g.items.filter((i) => !i.responsible).length,
                  0,
                )}{" "}
                pendências sem responsável
              </strong>{" "}
              — registros sem atribuição aparecem destacados em vermelho claro.
            </div>

            <div className="filters portfolio-search-filters">
              <div className="searchrow">
                <div className="searchbox">
                  <Search size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)}
                    placeholder="Pesquisar em todos os campos..." />
                </div>
                <button type="button" className="filter-button"
                  aria-expanded={portfolioFiltersOpen}
                  onClick={() => setPortfolioFiltersOpen((value) => !value)}>
                  <SlidersHorizontal size={15} /> Filtros
                  {portfolioActiveFilters > 0 && <span className="counter">{portfolioActiveFilters}</span>}
                  {portfolioFiltersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
            {portfolioFiltersOpen && (
            <div className="portfolio-extra-filters">
              <div className="portfolio-filter-heading">Filtros específicos das atividades</div>
              <div className="portfolio-filter-grid">
                <Multi label="Obra"
                  options={works.map(w => workFilterLabel(works, w)).sort((a,b)=>a.localeCompare(b,"pt-BR"))}
                  value={works.filter(w => portfolioWorkIds.includes(w.id)).map(w => workFilterLabel(works, w))}
                  onChange={values => setPortfolioWorkIds(works.filter(w => values.includes(workFilterLabel(works, w))).map(w => w.id))}
                />
                <label>Grupo
                  <select value={portfolioGroup} onChange={(e) => {setPortfolioGroup(e.target.value);setPortfolioActivity("all");}}>
                    <option value="all">Todos os grupos</option>
                    <option value="startDocs">Checklist de Início de Obra</option>
                    <option value="stages">Etapas</option>
                    <option value="endDocs">Checklist de Término de Obra</option>
                  </select>
                </label>
                <label>Atividade / Documento
                  <select value={portfolioActivity} onChange={(e) => setPortfolioActivity(e.target.value)}>
                    <option value="all">Todas as atividades</option>
                    {portfolioNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label>Status
                  <select value={portfolioStatus} onChange={(e) => setPortfolioStatus(e.target.value)}>
                    <option value="all">Todos os status</option>
                    {portfolioStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label>Responsável
                  <select value={portfolioResponsible} onChange={(e) => setPortfolioResponsible(e.target.value)}>
                    <option value="all">Todos os responsáveis</option>
                    <option value="__empty">Sem responsável</option>
                    {portfolioResponsibles.map((id) => <option key={id} value={id}>{users.find((u) => u.id === id)?.name || id}</option>)}
                  </select>
                </label>
                <label>Data de referência
                  <select value={portfolioDateKind} onChange={(e) => setPortfolioDateKind(e.target.value)}>
                    <option value="end">Previsão de término</option>
                    <option value="start">Previsão de início</option>
                    <option value="status">Data do status</option>
                  </select>
                </label>
                <label>Data inicial<input type="date" value={portfolioFrom} onChange={(e) => setPortfolioFrom(e.target.value)} /></label>
                <label>Data final<input type="date" value={portfolioTo} onChange={(e) => setPortfolioTo(e.target.value)} /></label>
                <label>Consulta rápida
                  <select value={portfolioQuick} onChange={(e) => setPortfolioQuick(e.target.value)}>
                    <option value="all">Todas as atividades</option>
                    <option value="overdue">Atrasadas</option>
                    <option value="week">Vencem em 7 dias</option>
                    <option value="unassigned">Sem responsável</option>
                    <option value="progress">Em andamento</option>
                  </select>
                </label>
              </div>
              <div className="portfolio-filter-actions">
                <button type="button" onClick={resetPortfolioFilters}>Limpar filtros</button>
                <button type="button" className="portfolio-apply-button" onClick={() => {
                  setAppliedPortfolio({workIds: portfolioWorkIds, group:portfolioGroup, activity:portfolioActivity,
                    status:portfolioStatus, responsible:portfolioResponsible,
                    dateKind:portfolioDateKind, from:portfolioFrom, to:portfolioTo, quick:portfolioQuick});
                  setPortfolioFiltersOpen(false);
                }}>Aplicar</button>
              </div>
            </div>
            )}


            {(["stages", "startDocs", "endDocs"] as const).map((kind) => (
              <section className="portfolio-section" key={kind}>
                <h2>
                  {kind === "stages"
                    ? "Etapas da Obra"
                    : kind === "startDocs"
                      ? "Checklist de Início de Obra"
                      : "Checklist de Conclusão de Obra"}{" "}
                  (
                  {portfolio
                    .filter((g) => g.kind === kind)
                    .reduce((n, g) => n + g.items.length, 0)}
                  )
                </h2>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Obra</th>
                        <th>Município</th>
                        <th>Endereço</th>
                        <th>{kind === "stages" ? "Etapa" : "Documento"}</th>
                        <th>Responsável</th>
                        <th>Status</th>
                        <th>Prev. início</th>
                        <th>Prev. término</th>
                        <th>Data Status</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio
                        .filter((g) => g.kind === kind)
                        .flatMap((g) =>
                          g.items.map((i) => (
                            <tr
                              key={i.id}
                              className={!i.responsible ? "unassigned" : ""}
                            >
                              <td>
                                <button
                                  className="link"
                                  onClick={() => {
                                    setWorkOrigin("carteira");
                                    setSelected(g.w.id);
                                    setOpenBlocks([]);
                                    setPage("obra");
                                  }}
                                >
                                  OB-
                                  {String(works.indexOf(g.w) + 1).padStart(
                                    4,
                                    "0",
                                  )}
                                </button>
                              </td>
                              <td>{g.w.city}</td>
                              <td>{g.w.address || "—"}</td>
                              <td>{i.name}</td>
                              <td>
                                {users.find((u) => u.id === i.responsible)
                                  ?.name || (
                                  <b className="red-text">Sem responsável</b>
                                )}
                              </td>
                              <td>
                                <Pill status={i.status} end={i.end} />
                              </td>
                              <td>{displayDate(i.start)}</td>
                              <td>{displayDate(i.end)}</td>
                              <td>{displayDate(i.statusAt)}</td>
                              <td>
                                <button
                                  className="primary small"
                                  onClick={() =>
                                    setEditItem({
                                      workId: g.w.id,
                                      kind,
                                      id: i.id,
                                    })
                                  }
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          )),
                        )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
        {page === "obra" && current && (
          <>
            <div className="page-heading">
              <div>
                <button className="back" onClick={() => setPage(workOrigin)}>
                  <ArrowLeft size={16} /> Voltar para {workOrigin === "dashboard" ? "Dashboard" : workOrigin === "carteira" ? "Carteira de Atividades" : "Obras"}
                </button>
                <h1>{current.address || "Nova obra"}</h1>
                <p>
                  {current.city} · {current.service} ·{" "}
                  <Pill
                    status={executionStatus(current)}
                    end={executionStage(current)?.end}
                  />
                </p>
              </div>

              {user.role === "admin" && (
                <button
                  className="danger-button"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Excluir definitivamente esta obra e seus dados? Esta ação será auditada.",
                      )
                    ) {
                      return;
                    }

                    try {
                      await removeWork(current.id);
                      setWorks((v) => v.filter((w) => w.id !== current.id));
                      navigate("obras");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  <Trash2 size={15} /> Excluir obra
                </button>
              )}
            </div>

            {[
              {
                id: "dados",
                name: "DADOS DA OBRA",
                metric: `${current.service} · ${current.ae} · ${meters(effectiveLength(current))} m · ${current.links} Lig. · ${current.png} PNG`,
              },
              {
                id: "croqui",
                name: "CROQUI DA OBRA",
                metric: `Ext. executada: ${executionPercent(current) ?? "N/A"}%`,
              },
              {
                id: "orcamento",
                name: "ORÇAMENTO DA OBRA",
                metric: money(budgetTotal(current)),
              },
              {
                id: "etapas",
                name: "ETAPAS",
                metric: `${progress(current.stages) ?? "N/A"}% concluídas`,
              },
              {
                id: "inicio",
                name: "CHECKLIST DE INÍCIO DE OBRA",
                metric: `${progress(current.startDocs) ?? "N/A"}% concluído`,
              },
              {
                id: "conclusao",
                name: "CHECKLIST DE CONCLUSÃO DE OBRA",
                metric: `${progress(current.endDocs) ?? "N/A"}% concluído`,
              },
              {
                id: "cronograma",
                name: "CRONOGRAMA DA OBRA",
                metric: "Planejamento consolidado",
              },
              {
                id: "fotos",
                name: "RELATÓRIOS FOTOGRÁFICOS",
                metric: `${current.reports.length} relatórios`,
              },
            ].map((b) => (
              <section className="accordion" key={b.id}>
                <button
                  className="accordion-title"
                  onClick={() =>
                    setOpenBlocks((v) =>
                      v.includes(b.id)
                        ? v.filter((x) => x !== b.id)
                        : [...v, b.id],
                    )
                  }
                >
                  <span className="accordion-title-main">{b.id === "dados" ? <Building2 size={18} /> : b.id === "croqui" ? <SlidersHorizontal size={18} /> : b.id === "orcamento" ? <FileText size={18} /> : b.id === "etapas" ? <ClipboardList size={18} /> : b.id === "inicio" || b.id === "conclusao" ? <Check size={18} /> : b.id === "cronograma" ? <HardHat size={18} /> : <FileText size={18} />}<strong>{b.name}</strong></span>
                  <span>{b.metric}</span>
                  {openBlocks.includes(b.id) ? (
                    <ChevronUp size={17} />
                  ) : (
                    <ChevronDown size={17} />
                  )}
                </button>

                {openBlocks.includes(b.id) && (
                  <div className="accordion-body">
                    {b.id === "fotos" ? (
                      <PhotoReportsBlock
                        work={current}
                        users={users}
                        admin={user.role === "admin"}
                        save={(w) => save(w, current)}
                      />
                    ) : (
                      <EditableBlock
                        key={current.id + ":" + b.id}
                        owner={user.id}
                        work={current}
                        id={b.id}
                        save={(w) => save(w, current)}
                      >
                        {(draft, change, editing) => (
                          <>
                            {b.id === "dados" && (
                              <WorkForm work={draft} update={change} />
                            )}

                            {b.id === "croqui" && (
                              <MapEditor
                                work={draft}
                                readOnly={!editing}
                                onChange={(w) => change(w)}
                              />
                            )}

                            {b.id === "orcamento" && (
                              <Budget work={draft} update={change} />
                            )}

                            {["etapas", "inicio", "conclusao"].includes(
                              b.id,
                            ) && (
                              <ItemTable
                                readOnly={!editing}
                                work={draft}
                                kind={
                                  b.id === "etapas"
                                    ? "stages"
                                    : b.id === "inicio"
                                      ? "startDocs"
                                      : "endDocs"
                                }
                                users={users}
                                change={(kind, id, p) =>
                                  change({
                                    [kind]: draft[kind].map((i) =>
                                      i.id === id
                                        ? {
                                            ...i,
                                            ...p,
                                            statusAt:
                                              p.status && p.status !== i.status
                                                ? new Date().toISOString()
                                                : i.statusAt,
                                          }
                                        : i,
                                    ),
                                  })
                                }
                              />
                            )}

                            {b.id === "cronograma" && (
                              <WorkSchedule work={draft} users={users} />
                            )}
                          </>
                        )}
                      </EditableBlock>
                    )}
                  </div>
                )}
              </section>
            ))}
          </>
        )}

        {page === "usuarios" && user.role === "admin" && (
          <UserAdmin users={users} refresh={() => loadUsers().then(setUsers)} />
        )}

        {page === "auditoria" && (
          <>
            <div className="page-heading">
              <h1>Auditoria</h1>
              <button onClick={() => loadAudit().then(setAudit)}>
                <Save size={15} /> Atualizar
              </button>
            </div>
            <p className="hint">
              Quem alterou, quando, o que mudou e os valores anteriores e novos.
            </p>
            <div className="audit-toolbar">
              <input aria-label="Pesquisar auditoria" placeholder="Pesquisar qualquer informação..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
              <button type="button" aria-expanded={auditFiltersOpen} onClick={() => setAuditFiltersOpen(v => !v)}>
                Filtros{auditActiveFilters ? ` (${auditActiveFilters})` : ""} {auditFiltersOpen ? "▴" : "▾"}
              </button>
            </div>
            {auditFiltersOpen && <div className="audit-filters">
              <label>Usuário<select value={auditUserFilter} onChange={e => setAuditUserFilter(e.target.value)}><option value="">Todos</option>{auditOptions("who").map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label>Tabela<select value={auditTableFilter} onChange={e => setAuditTableFilter(e.target.value)}><option value="">Todas</option>{auditOptions("table").map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label>Campo alterado<select value={auditFieldFilter} onChange={e => setAuditFieldFilter(e.target.value)}><option value="">Todos</option>{auditOptions("field").map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label>Data da alteração<select value={auditDateFilter} onChange={e => setAuditDateFilter(e.target.value)}><option value="">Todas</option>{auditOptions("date").map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <div className="audit-filter-actions">
                <button type="button" onClick={() => {setAuditUserFilter("");setAuditTableFilter("");setAuditFieldFilter("");setAuditDateFilter("");}}>Limpar filtros</button>
                <button type="button" onClick={() => setAuditFiltersOpen(false)}>Recolher filtros</button>
              </div>
            </div>}
            <p className="hint">{visibleAuditRows.length} registro(s) encontrado(s)</p>
            <div className="table-scroll">
              <table className="simple-audit-table">
                <thead><tr><th>Quem alterou</th><th>Quando alterou</th><th>O que alterou</th><th>Como alterou</th></tr></thead>
                <tbody>
                  {visibleAuditRows.map(row => <tr key={row.key}>
                    <td>{row.who}</td><td>{row.when}</td><td>{row.what}</td>
                    <td><span className="audit-before">{row.before}</span><span className="audit-arrow"> → </span><span className="audit-after">{row.after}</span></td>
                  </tr>)}
                  {!visibleAuditRows.length && <tr><td colSpan={4}>Nenhum registro encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {editItem &&
        (() => {
          const w = works.find((x) => x.id === editItem.workId);
          const i = w?.[editItem.kind].find((x) => x.id === editItem.id);

          if (!w || !i) return null;

          const auto = editItem.kind === "stages" && isChecklist(i.name);

          return (
            <div className="modal-backdrop" onClick={() => setEditItem(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{i.name}</h2>
                  <button onClick={() => setEditItem(null)}>
                    <X />
                  </button>
                </div>

                <p className="hint">
                  {w.city} · {w.address}
                </p>

                <div className="form-grid">
                  <div className="form-field">
                    <label>Status</label>
                    {auto ? (
                      <Pill status={i.status} />
                    ) : (
                      <select
                        value={i.status}
                        onChange={(e) =>
                          changeItem(w, editItem.kind, i.id, {
                            status: e.target.value,
                          })
                        }
                      >
                        {(editItem.kind === "stages"
                          ? STAGE_STATUS
                          : DOC_STATUS
                        ).map((s) => (
                          <option disabled={s === "CADASTRADO"} key={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="form-field">
                    <label>Responsável</label>
                    <ResponsibleSelect
                      users={users}
                      value={i.responsible}
                      onChange={(responsible) =>
                        changeItem(w, editItem.kind, i.id, {
                          responsible,
                        })
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>Previsão início</label>
                    <input
                      type="date"
                      disabled={auto}
                      value={i.start}
                      onChange={(e) =>
                        changeItem(w, editItem.kind, i.id, {
                          start: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>Previsão término</label>
                    <input
                      type="date"
                      disabled={auto}
                      value={i.end}
                      onChange={(e) =>
                        changeItem(w, editItem.kind, i.id, {
                          end: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-field wide">
                    <label>Observação</label>
                    <textarea
                      value={i.note}
                      onChange={(e) =>
                        changeItem(w, editItem.kind, i.id, {
                          note: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="right">
                  <button className="primary" onClick={() => setEditItem(null)}>
                    <Check size={15} /> Concluir
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default App;
