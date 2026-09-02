import React, { useEffect, useMemo, useRef, useState } from "react";
import { cloudConfigured, getSession, loadCloudData, login, logout, saveCloudData, type AuthSession, type CloudData } from "./cloud";

type Status = "Pendente" | "Em andamento" | "Concluído";
type PagamentoStatus = "Pago" | "Pendente";

type Etapa = {
  id: number;
  nome: string;
  percentual: number;
};

type Obra = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  inicio: string;
  previsao: string;
  orcamento: number;
  status: Status;
  equipe: number[];
  etapas: Etapa[];
};

type Pessoa = {
  id: number;
  nome: string;
  funcao: string;
  telefone: string;
  diaria: number;
  pix: string;
  tipoPix: string;
};

type Tarefa = {
  id: number;
  obra: string;
  descricao: string;
  responsavel: string;
  prazo: string;
  status: Status;
};

type Material = {
  id: number;
  obra: string;
  nome: string;
  quantidade: number;
  unidade: string;
  valor: number;
};

type Despesa = {
  id: number;
  obra: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
};

type Pagamento = {
  id: number;
  obra: string;
  descricao: string;
  valor: number;
  data: string;
  status: PagamentoStatus;
};

const hoje = new Date().toISOString().slice(0, 10);

const dinheiro = (valor: number) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const numero = (valor: string) => {
  const limpo = String(valor)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

const CHAVE_DADOS = "obracontrol_dados_v2";

const ler = <T,>(chave: string, padrao: T[]): T[] => {
  try {
    const valorNovo = localStorage.getItem(CHAVE_DADOS);

    if (valorNovo) {
      const dados = JSON.parse(valorNovo);
      const lista = dados?.[chave];
      return Array.isArray(lista) ? lista : padrao;
    }

    // Compatibilidade: recupera dados da versão anterior do aplicativo.
    const valorAntigo = localStorage.getItem(chave);
    if (!valorAntigo) return padrao;

    const dadosAntigos = JSON.parse(valorAntigo);
    return Array.isArray(dadosAntigos) ? dadosAntigos : padrao;
  } catch {
    return padrao;
  }
};

function Empty({ texto }: { texto: string }) {
  return (
    <div className="empty">
      <div className="emptyIcon">📭</div>
      <strong>{texto}</strong>
      <span>Use o botão + Adicionar para começar.</span>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (value: Status) => void;
}) {
  return (
    <select
      className={`status status-${value
        .toLowerCase()
        .replaceAll(" ", "-")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")}`}
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
    >
      <option value="Pendente">Pendente</option>
      <option value="Em andamento">Em andamento</option>
      <option value="Concluído">Concluído</option>
    </select>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b>*</b>}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Modal({
  titulo,
  children,
  fechar,
  largura = 650,
}: {
  titulo: string;
  children: React.ReactNode;
  fechar: () => void;
  largura?: number;
}) {
  return (
    <div className="modalOverlay" onMouseDown={fechar}>
      <div
        className="modal"
        style={{ maxWidth: largura }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <h2>{titulo}</h2>
            <span>Preencha os dados abaixo</span>
          </div>

          <button className="close" onClick={fechar}>
            ×
          </button>
        </div>

        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

function BarraProgresso({ valor }: { valor: number }) {
  const porcentagem = Math.max(0, Math.min(100, valor));

  return (
    <div>
      <div className="progressInfo">
        <strong>{Math.round(porcentagem)}%</strong>
      </div>

      <div className="progress">
        <div
          className="progressBar"
          style={{ width: `${porcentagem}%` }}
        />
      </div>
    </div>
  );
}

const estilos = `
* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  width: 100%;
  min-height: 100%;
}

body {
  font-family: Inter, Arial, Helvetica, sans-serif;
  background: #f4f6f8;
  color: #18212f;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.app {
  min-height: 100vh;
  display: flex;
}

.sidebar {
  width: 245px;
  background: #111827;
  color: white;
  min-height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  padding: 22px 14px;
  z-index: 20;
}

.logo {
  padding: 8px 12px 25px;
}

.logo h1 {
  margin: 0;
  font-size: 25px;
}

.logo span {
  color: #9ca3af;
  font-size: 12px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.nav button {
  width: 100%;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  text-align: left;
  padding: 13px 12px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 11px;
}

.nav button:hover {
  background: #1f2937;
  color: white;
}

.nav button.active {
  background: #2563eb;
  color: white;
  font-weight: 700;
}

.nav button span {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 20px;
}

.main {
  margin-left: 245px;
  width: calc(100% - 245px);
  min-height: 100vh;
  padding: 28px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

header h1 {
  margin: 0;
  font-size: 28px;
}

header span {
  color: #6b7280;
  font-size: 14px;
}

.primary,
.secondary,
.danger,
.close,
.cancel {
  border: 0;
  border-radius: 9px;
  padding: 11px 16px;
  font-weight: 700;
}

.primary {
  background: #2563eb;
  color: white;
}

.primary:hover {
  background: #1d4ed8;
}

.secondary {
  background: #e8eefc;
  color: #1d4ed8;
}

.danger {
  background: #fee2e2;
  color: #dc2626;
  padding: 9px 12px;
}

.danger:hover {
  background: #fecaca;
}

.close {
  width: 38px;
  height: 38px;
  padding: 0;
  font-size: 27px;
  background: #f3f4f6;
  color: #374151;
}

.cancel {
  background: #f3f4f6;
  color: #374151;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.card {
  background: white;
  border-radius: 15px;
  padding: 19px;
  display: flex;
  gap: 14px;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.05);
  border: 1px solid #e5e7eb;
  transition: .15s;
  text-align: left;
  width: 100%;
}

.card.clickable {
  cursor: pointer;
}

.card.clickable:hover {
  transform: translateY(-2px);
  border-color: #93c5fd;
  box-shadow: 0 5px 16px rgba(37,99,235,.12);
}

.cardIcon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 23px;
  flex-shrink: 0;
}

.cardInfo {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.cardInfo span {
  color: #6b7280;
  font-size: 13px;
}

.cardInfo strong {
  font-size: 20px;
}

.panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 15px;
  padding: 21px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}

.panelHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 18px;
}

.panelHeader h2 {
  margin: 0 0 5px;
  font-size: 19px;
}

.panelHeader p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.tableWrap {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 650px;
}

th,
td {
  padding: 13px 10px;
  border-bottom: 1px solid #edf0f3;
  text-align: left;
  font-size: 14px;
}

th {
  color: #6b7280;
  font-size: 12px;
  text-transform: uppercase;
}

.status {
  border: 0;
  border-radius: 20px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  background: #f3f4f6;
}

.status-pendente {
  background: #fef3c7;
  color: #92400e;
}

.status-em-andamento {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-concluido {
  background: #dcfce7;
  color: #166534;
}

.cardsList {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.itemCard {
  border: 1px solid #e5e7eb;
  border-radius: 13px;
  padding: 17px;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
}

.itemCard h3 {
  margin: 0 0 9px;
  font-size: 16px;
}

.itemCard p {
  margin: 4px 0;
  color: #6b7280;
  font-size: 13px;
}

.itemCard strong {
  display: block;
  margin-top: 9px;
  font-size: 16px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty {
  padding: 45px 15px;
  text-align: center;
  color: #6b7280;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.emptyIcon {
  font-size: 38px;
}

.progress {
  width: 100%;
  height: 13px;
  background: #e5e7eb;
  border-radius: 20px;
  overflow: hidden;
}

.progressBar {
  height: 100%;
  background: #2563eb;
  border-radius: 20px;
  transition: width .3s;
}

.progressInfo {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 5px;
  color: #2563eb;
}

.modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15px;
  overflow-y: auto;
}

.modal {
  background: white;
  width: min(700px, 100%);
  max-height: 94vh;
  overflow-y: auto;
  border-radius: 17px;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
}

.modalHeader {
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
}

.modalHeader h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.modalHeader span {
  color: #6b7280;
  font-size: 13px;
}

.modalBody {
  padding: 20px;
}

.formGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field.full {
  grid-column: 1 / -1;
}

.field span {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}

.field span b {
  color: #dc2626;
  margin-left: 3px;
}

.field input,
.field select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  padding: 12px;
  outline: none;
  background: white;
  color: #111827;
  min-height: 45px;
}

.field input:focus,
.field select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,.12);
}

.formActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.sectionTitle {
  margin: 25px 0 12px;
  font-size: 16px;
  font-weight: 800;
}

.etapa {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 13px;
  margin-bottom: 10px;
}

.etapaTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.etapaNome {
  font-weight: 700;
}

.etapaPercentual {
  font-weight: 800;
  color: #2563eb;
}

.etapaControls {
  display: flex;
  gap: 7px;
  margin-top: 10px;
}

.etapaControls button {
  border: 0;
  background: #eef2f7;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 800;
}

.etapaControls input {
  flex: 1;
  min-width: 70px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  text-align: center;
  padding: 7px;
}

.equipeGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.funcionarioBox {
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  padding: 12px;
}

.funcionarioBox label {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
}

.funcionarioBox input {
  width: 18px;
  height: 18px;
}

.funcionarioInfo {
  margin-top: 7px;
  color: #6b7280;
  font-size: 12px;
}

.pix {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
}

.obraProgress {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #edf0f3;
}

.etapasResumo {
  margin-top: 14px;
}

.etapaResumo {
  margin-bottom: 10px;
}

.etapaResumoHeader {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

.equipeResumo {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.pessoaTag {
  background: #eef2ff;
  color: #3730a3;
  border-radius: 20px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}

.obraBotoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

@media (max-width: 900px) {
  .sidebar {
    width: 72px;
    padding: 14px 8px;
  }

  .logo {
    text-align: center;
    padding: 8px 0 20px;
  }

  .logo h1 {
    font-size: 0;
  }

  .logo h1:after {
    content: "OC";
    font-size: 19px;
  }

  .logo span {
    display: none;
  }

  .nav button {
    width: 56px;
    height: 50px;
    margin: 0 auto;
    padding: 0;
    justify-content: center;
    gap: 0;
    font-size: 0;
  }

  .nav button span {
    width: 100%;
    height: 100%;
    font-size: 22px;
  }

  .nav button label {
    display: none;
  }

  .main {
    margin-left: 72px;
    width: calc(100% - 72px);
    padding: 18px;
  }

  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .main {
    padding: 13px;
  }

  header {
    align-items: flex-start;
  }

  header h1 {
    font-size: 23px;
  }

  header .primary {
    padding: 10px 12px;
  }

  .grid {
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }

  .card {
    padding: 13px;
    gap: 9px;
  }

  .cardIcon {
    width: 38px;
    height: 38px;
    font-size: 18px;
  }

  .cardInfo strong {
    font-size: 15px;
  }

  .cardInfo span {
    font-size: 11px;
  }

  .panel {
    padding: 14px;
  }

  .panelHeader {
    align-items: flex-start;
  }

  .itemCard {
    align-items: flex-start;
    flex-direction: column;
  }

  .actions {
    width: 100%;
  }

  .actions .status {
    flex: 1;
  }

  .formGrid {
    grid-template-columns: 1fr;
  }

  .field.full {
    grid-column: auto;
  }

  .equipeGrid {
    grid-template-columns: 1fr;
  }

  .modalOverlay {
    align-items: flex-start;
    padding: 8px;
  }

  .modal {
    margin-top: 3vh;
  }

  .modalBody {
    padding: 15px;
  }
}


.authScreen { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(135deg, #0f172a, #1e293b); }
.authCard { width: min(420px, 100%); background: #fff; border-radius: 24px; padding: 34px; box-shadow: 0 24px 80px rgba(0,0,0,.25); }
.authLogo { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: #eef2ff; font-size: 30px; margin-bottom: 16px; }
.authCard h1 { margin: 0 0 6px; font-size: 30px; color: #1e293b; }
.authSubtitle { color: #64748b; margin: 0 0 18px; }
.authBadge { display: inline-block; padding: 7px 11px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 13px; font-weight: 700; margin-bottom: 18px; }
.authButton { width: 100%; margin-top: 8px; min-height: 48px; }
.authError { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 11px 12px; border-radius: 10px; margin: 10px 0; font-size: 14px; }
.authHint { display: block; color: #64748b; line-height: 1.45; margin-top: 16px; }
.authSpinner { width: 26px; height: 26px; border: 3px solid #e2e8f0; border-top-color: #475569; border-radius: 50%; animation: obracontrolSpin .8s linear infinite; margin-top: 18px; }
@keyframes obracontrolSpin { to { transform: rotate(360deg); } }
.topbar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-bottom: 14px; min-height: 34px; }
.onlineDot { color: #059669; font-size: 13px; font-weight: 700; }
.syncText { color: #64748b; font-size: 12px; }
.userEmail { color: #475569; font-size: 13px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logoutBtn { border: 1px solid #e2e8f0; background: #fff; border-radius: 9px; padding: 7px 11px; cursor: pointer; }
@media (max-width: 700px) { .topbar { justify-content: space-between; flex-wrap: wrap; } .userEmail { max-width: 150px; } .authCard { padding: 26px; } }
`;

function App() {
  const [aba, setAba] = useState("Dashboard");
  const [modal, setModal] = useState<string | null>(null);
  const [obraSelecionada, setObraSelecionada] =
    useState<number | null>(null);

  const [obras, setObras] = useState<Obra[]>(() =>
    ler<Obra>("obras", [])
  );

  const [tarefas, setTarefas] = useState<Tarefa[]>(() =>
    ler<Tarefa>("tarefas", [])
  );

  const [pessoas, setPessoas] = useState<Pessoa[]>(() =>
    ler<Pessoa>("pessoas", [])
  );

  const [materiais, setMateriais] = useState<Material[]>(() =>
    ler<Material>("materiais", [])
  );

  const [despesas, setDespesas] = useState<Despesa[]>(() =>
    ler<Despesa>("despesas", [])
  );

  const [pagamentos, setPagamentos] = useState<Pagamento[]>(() =>
    ler<Pagamento>("pagamentos", [])
  );

  const [obraForm, setObraForm] = useState({
    nome: "",
    cliente: "",
    local: "",
    inicio: hoje,
    previsao: "",
    orcamento: "",
    status: "Pendente" as Status,
  });

  const [obraEditandoId, setObraEditandoId] = useState<number | null>(null);

  const [pessoaForm, setPessoaForm] = useState({
    nome: "",
    funcao: "",
    telefone: "",
    diaria: "",
    pix: "",
    tipoPix: "Aleatória",
  });

  const [etapaForm, setEtapaForm] = useState({
    nome: "",
    percentual: "0",
  });

  const [tarefaForm, setTarefaForm] = useState({
    obra: "",
    descricao: "",
    responsavel: "",
    prazo: "",
    status: "Pendente" as Status,
  });

  const [materialForm, setMaterialForm] = useState({
    obra: "",
    nome: "",
    quantidade: "",
    unidade: "un",
    valor: "",
  });

  const [despesaForm, setDespesaForm] = useState({
    obra: "",
    descricao: "",
    categoria: "Material",
    valor: "",
    data: hoje,
  });

  const [pagamentoForm, setPagamentoForm] = useState({
    obra: "",
    descricao: "",
    valor: "",
    data: hoje,
    status: "Pendente" as PagamentoStatus,
  });

  const [sessao, setSessao] = useState<AuthSession | null>(null);
  const [authCarregando, setAuthCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [emailLogin, setEmailLogin] = useState("");
  const [senhaLogin, setSenhaLogin] = useState("");
  const [erroLogin, setErroLogin] = useState("");
  const [cloudPronto, setCloudPronto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const ultimoServidor = useRef<string | null>(null);
  const primeiraGravacaoCloud = useRef(true);
  const aplicandoDadosRemotos = useRef(false);

  const dadosAtuais = (): CloudData => ({
    obras,
    tarefas,
    pessoas,
    materiais,
    despesas,
    pagamentos,
  });

  const aplicarDados = (dados: CloudData) => {
    aplicandoDadosRemotos.current = true;
    setObras(Array.isArray(dados.obras) ? dados.obras as Obra[] : []);
    setTarefas(Array.isArray(dados.tarefas) ? dados.tarefas as Tarefa[] : []);
    setPessoas(Array.isArray(dados.pessoas) ? dados.pessoas as Pessoa[] : []);
    setMateriais(Array.isArray(dados.materiais) ? dados.materiais as Material[] : []);
    setDespesas(Array.isArray(dados.despesas) ? dados.despesas as Despesa[] : []);
    setPagamentos(Array.isArray(dados.pagamentos) ? dados.pagamentos as Pagamento[] : []);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!cloudConfigured) {
        setAuthCarregando(false);
        return;
      }
      const atual = await getSession();
      if (!ativo) return;
      if (atual) {
        setSessao(atual);
        try {
          const remoto = await loadCloudData(atual);
          if (remoto.data) {
            aplicarDados(remoto.data);
            ultimoServidor.current = remoto.updatedAt;
          } else {
            const stamp = await saveCloudData(atual, dadosAtuais());
            ultimoServidor.current = stamp;
          }
          setCloudPronto(true);
        } catch (erro) {
          console.error(erro);
          setErroLogin("Não foi possível carregar seus dados online. Verifique sua internet.");
          setSessao(null);
        }
      }
      setAuthCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!sessao || !cloudPronto) return;
    if (primeiraGravacaoCloud.current) {
      primeiraGravacaoCloud.current = false;
      return;
    }
    if (aplicandoDadosRemotos.current) {
      aplicandoDadosRemotos.current = false;
      return;
    }

    const temporizador = window.setTimeout(async () => {
      try {
        setSincronizando(true);
        const dados = dadosAtuais();
        try {
          localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
        } catch (erroLocal) {
          console.warn("Cache local indisponível:", erroLocal);
        }
        const stamp = await saveCloudData(sessao, dados);
        ultimoServidor.current = stamp;
      } catch (erro) {
        console.error("Não foi possível sincronizar os dados:", erro);
      } finally {
        setSincronizando(false);
      }
    }, 350);
    return () => window.clearTimeout(temporizador);
  }, [obras, tarefas, pessoas, materiais, despesas, pagamentos, sessao, cloudPronto]);

  useEffect(() => {
    if (!sessao) return;
    const renovarSessao = async () => {
      const atual = await getSession();
      if (!atual) {
        setSessao(null);
        setCloudPronto(false);
        return;
      }
      if (atual.access_token !== sessao.access_token) setSessao(atual);
    };
    const intervalo = window.setInterval(renovarSessao, 45 * 60 * 1000);
    return () => window.clearInterval(intervalo);
  }, [sessao]);

  useEffect(() => {
    if (!sessao || !cloudPronto) return;
    const sincronizarDeOutroDispositivo = async () => {
      try {
        const remoto = await loadCloudData(sessao);
        if (remoto.data && remoto.updatedAt && remoto.updatedAt !== ultimoServidor.current) {
          aplicarDados(remoto.data);
          ultimoServidor.current = remoto.updatedAt;
        }
      } catch (erro) {
        console.warn("Sincronização automática indisponível:", erro);
      }
    };
    const intervalo = window.setInterval(sincronizarDeOutroDispositivo, 8000);
    return () => window.clearInterval(intervalo);
  }, [sessao, cloudPronto]);

  const entrarNoSistema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailLogin.trim() || !senhaLogin) {
      setErroLogin("Digite seu e-mail e sua senha.");
      return;
    }
    setEntrando(true);
    setErroLogin("");
    try {
      const novaSessao = await login(emailLogin, senhaLogin);
      const remoto = await loadCloudData(novaSessao);
      setSessao(novaSessao);
      if (remoto.data) {
        aplicarDados(remoto.data);
        ultimoServidor.current = remoto.updatedAt;
      } else {
        const stamp = await saveCloudData(novaSessao, dadosAtuais());
        ultimoServidor.current = stamp;
      }
      primeiraGravacaoCloud.current = true;
      setCloudPronto(true);
    } catch (erro) {
      setErroLogin(erro instanceof Error ? erro.message : "Não foi possível entrar.");
    } finally {
      setEntrando(false);
    }
  };

  const sairDoSistema = async () => {
    await logout(sessao);
    setSessao(null);
    setCloudPronto(false);
    primeiraGravacaoCloud.current = true;
  };

  const totalOrcamento = useMemo(
    () => obras.reduce((total, item) => total + item.orcamento, 0),
    [obras]
  );

  const totalDespesas = useMemo(
    () => despesas.reduce((total, item) => total + item.valor, 0),
    [despesas]
  );

  const totalMateriais = useMemo(
    () =>
      materiais.reduce(
        (total, item) => total + item.quantidade * item.valor,
        0
      ),
    [materiais]
  );

  const totalPago = useMemo(
    () =>
      pagamentos
        .filter((item) => item.status === "Pago")
        .reduce((total, item) => total + item.valor, 0),
    [pagamentos]
  );

  const totalPendente = useMemo(
    () =>
      pagamentos
        .filter((item) => item.status === "Pendente")
        .reduce((total, item) => total + item.valor, 0),
    [pagamentos]
  );

  const progressoObra = (obra: Obra) => {
    if (!obra.etapas || obra.etapas.length === 0) return 0;

    return (
      obra.etapas.reduce(
        (total, etapa) => total + Number(etapa.percentual || 0),
        0
      ) / obra.etapas.length
    );
  };

  const obraAtual = obras.find(
    (obra) => obra.id === obraSelecionada
  );

  const excluir = (
    tipo:
      | "obra"
      | "tarefa"
      | "pessoa"
      | "material"
      | "despesa"
      | "pagamento",
    id: number
  ) => {
    if (!window.confirm("Deseja realmente excluir este item?")) return;

    if (tipo === "obra") {
      setObras((lista) => lista.filter((item) => item.id !== id));
    }

    if (tipo === "tarefa") {
      setTarefas((lista) => lista.filter((item) => item.id !== id));
    }

    if (tipo === "pessoa") {
      setPessoas((lista) => lista.filter((item) => item.id !== id));

      setObras((lista) =>
        lista.map((obra) => ({
          ...obra,
          equipe: obra.equipe.filter((pessoaId) => pessoaId !== id),
        }))
      );
    }

    if (tipo === "material") {
      setMateriais((lista) => lista.filter((item) => item.id !== id));
    }

    if (tipo === "despesa") {
      setDespesas((lista) => lista.filter((item) => item.id !== id));
    }

    if (tipo === "pagamento") {
      setPagamentos((lista) => lista.filter((item) => item.id !== id));
    }
  };

  const mudarStatusObra = (id: number, status: Status) => {
    setObras((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, status } : item
      )
    );
  };

  const mudarStatusTarefa = (id: number, status: Status) => {
    setTarefas((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, status } : item
      )
    );
  };

  const abrirModalDaAba = () => {
    if (aba === "Obras") setModal("obra");
    else if (aba === "Tarefas") setModal("tarefa");
    else if (aba === "Funcionários") setModal("pessoa");
    else if (aba === "Materiais") setModal("material");
    else if (aba === "Despesas") setModal("despesa");
    else if (aba === "Pagamentos") setModal("pagamento");
    else setModal("obra");
  };

  const adicionarObra = () => {
    if (!obraForm.nome.trim()) {
      alert("Informe o nome da obra.");
      return;
    }
    
    const nova: Obra = {
      id: Date.now(),
      nome: obraForm.nome.trim(),
      cliente: obraForm.cliente.trim(),
      local: obraForm.local.trim(),
      inicio: obraForm.inicio,
      previsao: obraForm.previsao,
      orcamento: numero(obraForm.orcamento),
      status: obraForm.status,
      equipe: [],
      etapas: [],
    };

    setObras((lista) => [...lista, nova]);

    setObraForm({
      nome: "",
      cliente: "",
      local: "",
      inicio: hoje,
      previsao: "",
      orcamento: "",
      status: "Pendente",
    });

    setModal(null);
  };

  const editarObra = (obraId: number) => {
  const obra = obras.find((item) => item.id === obraId);

  if (!obra) return;

  setObraForm({
    nome: obra.nome,
    cliente: obra.cliente || "",
    local: obra.local || "",
    inicio: obra.inicio || hoje,
    previsao: obra.previsao || "",
    orcamento: String(obra.orcamento ?? ""),
    status: obra.status,
  });

  setObraEditandoId(obra.id);
  setModal("obra");
};
      
  const adicionarPessoa = () => {
    if (!pessoaForm.nome.trim()) {
      alert("Informe o nome do funcionário.");
      return;
    }

    const nova: Pessoa = {
      id: Date.now(),
      nome: pessoaForm.nome.trim(),
      funcao: pessoaForm.funcao.trim(),
      telefone: pessoaForm.telefone.trim(),
      diaria: numero(pessoaForm.diaria),
      pix: pessoaForm.pix.trim(),
      tipoPix: pessoaForm.tipoPix,
    };

    setPessoas((lista) => [...lista, nova]);

    setPessoaForm({
      nome: "",
      funcao: "",
      telefone: "",
      diaria: "",
      pix: "",
      tipoPix: "Aleatória",
    });

    setModal(null);
  };
     
const adicionarEtapa = () => {
    if (!obraAtual) return;

    if (!etapaForm.nome.trim()) {
      alert("Informe o nome da etapa.");
      return;
    }

    const percentual = Math.max(
      0,
      Math.min(100, numero(etapaForm.percentual))
    );

    setObras((lista) =>
      lista.map((obra) =>
        obra.id === obraAtual.id
          ? {
              ...obra,
              etapas: [
                ...(obra.etapas || []),
                {
                  id: Date.now(),
                  nome: etapaForm.nome.trim(),
                  percentual,
                },
              ],
            }
          : obra
      )
    );

    setEtapaForm({
      nome: "",
      percentual: "0",
    });
  };

  const alterarEtapa = (
    obraId: number,
    etapaId: number,
    percentual: number
  ) => {
    const valor = Math.max(0, Math.min(100, percentual));

    setObras((lista) =>
      lista.map((obra) =>
        obra.id === obraId
          ? {
              ...obra,
              etapas: obra.etapas.map((etapa) =>
                etapa.id === etapaId
                  ? { ...etapa, percentual: valor }
                  : etapa
              ),
            }
          : obra
      )
    );
  };

  const editarNomeEtapa = (
    obraId: number,
    etapaId: number,
    nome: string
  ) => {
    setObras((lista) =>
      lista.map((obra) =>
        obra.id === obraId
          ? {
              ...obra,
              etapas: obra.etapas.map((etapa) =>
                etapa.id === etapaId
                  ? { ...etapa, nome }
                  : etapa
              ),
            }
          : obra
      )
    );
  };

  const excluirEtapa = (obraId: number, etapaId: number) => {
    if (!window.confirm("Excluir esta etapa?")) return;

    setObras((lista) =>
      lista.map((obra) =>
        obra.id === obraId
          ? {
              ...obra,
              etapas: obra.etapas.filter(
                (etapa) => etapa.id !== etapaId
              ),
            }
          : obra
      )
    );
  };

  const alternarPessoaNaObra = (
    obraId: number,
    pessoaId: number
  ) => {
    setObras((lista) =>
      lista.map((obra) => {
        if (obra.id !== obraId) return obra;

        const equipe = obra.equipe || [];

        return equipe.includes(pessoaId)
          ? {
              ...obra,
              equipe: equipe.filter((id) => id !== pessoaId),
            }
          : {
              ...obra,
              equipe: [...equipe, pessoaId],
            };
      })
    );
  };

  const adicionarTarefa = () => {
    if (!tarefaForm.descricao.trim()) {
      alert("Informe a descrição da tarefa.");
      return;
    }

    const nova: Tarefa = {
      id: Date.now(),
      obra: tarefaForm.obra,
      descricao: tarefaForm.descricao.trim(),
      responsavel: tarefaForm.responsavel.trim(),
      prazo: tarefaForm.prazo,
      status: tarefaForm.status,
    };

    setTarefas((lista) => [...lista, nova]);

    setTarefaForm({
      obra: "",
      descricao: "",
      responsavel: "",
      prazo: "",
      status: "Pendente",
    });

    setModal(null);
  };

  const adicionarMaterial = () => {
    if (!materialForm.nome.trim()) {
      alert("Informe o material.");
      return;
    }

    const novo: Material = {
      id: Date.now(),
      obra: materialForm.obra,
      nome: materialForm.nome.trim(),
      quantidade: numero(materialForm.quantidade),
      unidade: materialForm.unidade,
      valor: numero(materialForm.valor),
    };

    setMateriais((lista) => [...lista, novo]);

    setMaterialForm({
      obra: "",
      nome: "",
      quantidade: "",
      unidade: "un",
      valor: "",
    });

    setModal(null);
  };

  const adicionarDespesa = () => {
    if (!despesaForm.descricao.trim()) {
      alert("Informe a descrição da despesa.");
      return;
    }

    const nova: Despesa = {
      id: Date.now(),
      obra: despesaForm.obra,
      descricao: despesaForm.descricao.trim(),
      categoria: despesaForm.categoria,
      valor: numero(despesaForm.valor),
      data: despesaForm.data,
    };

    setDespesas((lista) => [...lista, nova]);

    setDespesaForm({
      obra: "",
      descricao: "",
      categoria: "Material",
      valor: "",
      data: hoje,
    });

    setModal(null);
  };

  const adicionarPagamento = () => {
    if (!pagamentoForm.descricao.trim()) {
      alert("Informe a descrição do pagamento.");
      return;
    }

    const novo: Pagamento = {
      id: Date.now(),
      obra: pagamentoForm.obra,
      descricao: pagamentoForm.descricao.trim(),
      valor: numero(pagamentoForm.valor),
      data: pagamentoForm.data,
      status: pagamentoForm.status,
    };

    setPagamentos((lista) => [...lista, novo]);

    setPagamentoForm({
      obra: "",
      descricao: "",
      valor: "",
      data: hoje,
      status: "Pendente",
    });

    setModal(null);
  };

  const abrirDetalhesObra = (id: number) => {
    setObraSelecionada(id);
    setModal("detalhesObra");
  };

  if (authCarregando) {
    return (
      <>
        <style>{estilos}</style>
        <div className="authScreen"><div className="authCard"><div className="authLogo">🛠️</div><h1>CGL - Gerenciamento de Obras</h1><p>Carregando seu espaço seguro...</p><div className="authSpinner" /></div></div>
      </>
    );
  }

  if (!cloudConfigured) {
    return (
      <>
        <style>{estilos}</style>
        <div className="authScreen"><div className="authCard"><div className="authLogo">⚙️</div><h1>CGL - Gerenciamento de Obras</h1><p>O modo online ainda não foi configurado.</p><p className="authHint">Depois de configurar o Supabase, este mesmo projeto ficará disponível no PC, Android e iPhone com uma única conta.</p></div></div>
      </>
    );
  }

  if (!sessao) {
    return (
      <>
        <style>{estilos}</style>
        <div className="authScreen">
          <form className="authCard" onSubmit={entrarNoSistema}>
            <div className="authLogo">🛠️</div>
            <h1>CGL - Gerenciamento de Obras</h1>
            <p className="authSubtitle">Seu gerenciamento de obras, em qualquer dispositivo.</p>
            <div className="authBadge">🔒 Acesso privado</div>
            <label className="field"><span>E-mail</span><input type="email" value={emailLogin} onChange={(e) => setEmailLogin(e.target.value)} autoComplete="username" placeholder="Seu e-mail" /></label>
            <label className="field"><span>Senha</span><input type="password" value={senhaLogin} onChange={(e) => setSenhaLogin(e.target.value)} autoComplete="current-password" placeholder="Sua senha" /></label>
            {erroLogin && <div className="authError">{erroLogin}</div>}
            <button className="primary authButton" disabled={entrando}>{entrando ? "Entrando..." : "Entrar no CGL"}</button>
            <small className="authHint">O cadastro é fechado. Somente a conta autorizada pelo proprietário pode entrar.</small>
          </form>
        </div>
      </>
    );
  }

  const navegacao = [
    ["Dashboard", "📊"],
    ["Obras", "🏗️"],
    ["Tarefas", "✅"],
    ["Funcionários", "👷"],
    ["Materiais", "📦"],
    ["Despesas", "🧾"],
    ["Pagamentos", "💰"],
  ];

  const Header = () => (
    <header>
      <div>
        <h1>{aba}</h1>
        <span>ObraControl • gerenciamento de obras e serviços</span>
      </div>

      <button className="primary" onClick={abrirModalDaAba}>
        + Adicionar
      </button>
    </header>
  );

  const conteudoDashboard = (
    <>
      <Header />

      <div className="grid">
        <button
          className="card clickable"
          onClick={() => setAba("Obras")}
        >
          <div className="cardIcon">🏗️</div>
          <div className="cardInfo">
            <span>Obras</span>
            <strong>{obras.length}</strong>
          </div>
        </button>

        <button
          className="card clickable"
          onClick={() => setAba("Obras")}
        >
          <div className="cardIcon">💰</div>
          <div className="cardInfo">
            <span>Orçamento total</span>
            <strong>{dinheiro(totalOrcamento)}</strong>
          </div>
        </button>

        <button
          className="card clickable"
          onClick={() => setAba("Despesas")}
        >
          <div className="cardIcon">🧾</div>
          <div className="cardInfo">
            <span>Despesas</span>
            <strong>
              {dinheiro(totalDespesas + totalMateriais)}
            </strong>
          </div>
        </button>

        <button
          className="card clickable"
          onClick={() => setAba("Funcionários")}
        >
          <div className="cardIcon">👷</div>
          <div className="cardInfo">
            <span>Funcionários</span>
            <strong>{pessoas.length}</strong>
          </div>
        </button>

        <button
          className="card clickable"
          onClick={() => setAba("Pagamentos")}
        >
          <div className="cardIcon">✅</div>
          <div className="cardInfo">
            <span>Pagamentos feitos</span>
            <strong>{dinheiro(totalPago)}</strong>
          </div>
        </button>

        <button
          className="card clickable"
          onClick={() => setAba("Pagamentos")}
        >
          <div className="cardIcon">⏳</div>
          <div className="cardInfo">
            <span>Pagamentos pendentes</span>
            <strong>{dinheiro(totalPendente)}</strong>
          </div>
        </button>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Resumo das obras</h2>
            <p>Acompanhe rapidamente seus projetos.</p>
          </div>

          <button
            className="secondary"
            onClick={() => setAba("Obras")}
          >
            Ver obras
          </button>
        </div>

        {obras.length === 0 ? (
          <Empty texto="Nenhuma obra cadastrada ainda." />
        ) : (
          <div className="cardsList">
            {obras.slice(0, 8).map((obra) => (
              <div className="itemCard" key={obra.id}>
                <div style={{ flex: 1 }}>
                  <h3>🏗️ {obra.nome}</h3>

                  <p>Cliente: {obra.cliente || "-"}</p>
                  <p>Local: {obra.local || "-"}</p>

                  <div className="obraProgress">
                    <p>
                      Progresso da obra:{" "}
                      <strong>{Math.round(progressoObra(obra))}%</strong>
                    </p>
                    <BarraProgresso
                      valor={progressoObra(obra)}
                    />
                  </div>
                </div>

                <button
                  className="secondary"
                  onClick={() => abrirDetalhesObra(obra.id)}
                >
                  Abrir obra
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const conteudoObras = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Obras</h2>
            <p>
              Cadastre, acompanhe etapas e organize sua equipe.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("obra")}
          >
            + Nova obra
          </button>
        </div>

        {obras.length === 0 ? (
          <Empty texto="Cadastre sua primeira obra." />
        ) : (
          <div className="cardsList">
            {obras.map((obra) => {
              const equipe = pessoas.filter((pessoa) =>
                (obra.equipe || []).includes(pessoa.id)
              );

              return (
                <div className="itemCard" key={obra.id}>
                  <div style={{ flex: 1 }}>
                    <h3>🏗️ {obra.nome}</h3>

                    <p>
                      Cliente: {obra.cliente || "-"}
                    </p>

                    <p>
                      Local: {obra.local || "-"}
                    </p>

                    <p>
                      Orçamento:{" "}
                      {dinheiro(obra.orcamento)}
                    </p>

                    <div className="obraProgress">
                      <p>
                        Progresso:{" "}
                        <strong>
                          {Math.round(progressoObra(obra))}%
                        </strong>
                      </p>

                      <BarraProgresso
                        valor={progressoObra(obra)}
                      />

                      {obra.etapas?.length > 0 && (
                        <div className="etapasResumo">
                          {obra.etapas.map((etapa) => (
                            <div
                              className="etapaResumo"
                              key={etapa.id}
                            >
                              <div className="etapaResumoHeader">
                                <span>{etapa.nome}</span>
                                <strong>
                                  {etapa.percentual}%
                                </strong>
                              </div>

                              <BarraProgresso
                                valor={etapa.percentual}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="equipeResumo">
                      {equipe.length === 0 ? (
                        <span className="pessoaTag">
                          Nenhum funcionário na obra
                        </span>
                      ) : (
                        equipe.map((pessoa) => (
                          <span
                            className="pessoaTag"
                            key={pessoa.id}
                          >
                            👷 {pessoa.nome}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="obraBotoes">
                      <button
                        className="primary"
                        onClick={() =>
                          abrirDetalhesObra(obra.id)
                        }
                      >
                        📋 Gerenciar obra
                      </button>

                      <StatusSelect
                        value={obra.status}
                        onChange={(valor) =>
                          mudarStatusObra(
                            obra.id,
                            valor
                          )
                        }
                      />

                      <button
  className="secondary"
  onClick={() => editarObra(obra.id)}
>
  ✏️ Editar
</button>

<button
  className="danger"
  onClick={() =>
    excluir("obra", obra.id)
  }
>
  🗑️ Excluir
</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  const conteudoFuncionarios = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Funcionários</h2>
            <p>
              Cadastre equipe, diária e chave Pix.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("pessoa")}
          >
            + Funcionário
          </button>
        </div>

        {pessoas.length === 0 ? (
          <Empty texto="Nenhum funcionário cadastrado." />
        ) : (
          <div className="cardsList">
            {pessoas.map((pessoa) => (
              <div className="itemCard" key={pessoa.id}>
                <div>
                  <h3>👷 {pessoa.nome}</h3>

                  <p>
                    Função: {pessoa.funcao || "-"}
                  </p>

                  <p>
                    Telefone: {pessoa.telefone || "-"}
                  </p>

                  <strong>
                    Diária: {dinheiro(pessoa.diaria)}
                  </strong>

                  <p className="pix">
                    💠 Pix: {pessoa.pix || "Não cadastrado"}
                  </p>

                  {pessoa.pix && (
                    <button
                      className="secondary"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(pessoa.pix)
                          .then(() =>
                            alert("Chave Pix copiada!")
                          )
                          .catch(() =>
                            alert(
                              "Não foi possível copiar automaticamente."
                            )
                          );
                      }}
                    >
                      📋 Copiar Pix
                    </button>
                  )}
                </div>

                <button
                  className="danger"
                  onClick={() =>
                    excluir("pessoa", pessoa.id)
                  }
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const conteudoTarefas = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Tarefas e serviços</h2>
            <p>Controle o que precisa ser feito.</p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("tarefa")}
          >
            + Nova tarefa
          </button>
        </div>

        {tarefas.length === 0 ? (
          <Empty texto="Nenhuma tarefa cadastrada." />
        ) : (
          <div className="cardsList">
            {tarefas.map((tarefa) => (
              <div className="itemCard" key={tarefa.id}>
                <div>
                  <h3>✅ {tarefa.descricao}</h3>
                  <p>Obra: {tarefa.obra || "-"}</p>
                  <p>
                    Responsável:{" "}
                    {tarefa.responsavel || "-"}
                  </p>
                  <p>Prazo: {tarefa.prazo || "-"}</p>
                </div>

                <div className="actions">
                  <StatusSelect
                    value={tarefa.status}
                    onChange={(valor) =>
                      mudarStatusTarefa(
                        tarefa.id,
                        valor
                      )
                    }
                  />

                  <button
                    className="danger"
                    onClick={() =>
                      excluir("tarefa", tarefa.id)
                    }
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const conteudoMateriais = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Materiais</h2>
            <p>Controle quantidade, unidade e custo.</p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("material")}
          >
            + Material
          </button>
        </div>

        {materiais.length === 0 ? (
          <Empty texto="Nenhum material cadastrado." />
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Material</th>
                  <th>Quantidade</th>
                  <th>Valor unit.</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {materiais.map((material) => (
                  <tr key={material.id}>
                    <td>{material.obra || "-"}</td>
                    <td>{material.nome}</td>
                    <td>
                      {material.quantidade}{" "}
                      {material.unidade}
                    </td>
                    <td>{dinheiro(material.valor)}</td>
                    <td>
                      {dinheiro(
                        material.quantidade *
                          material.valor
                      )}
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() =>
                          excluir(
                            "material",
                            material.id
                          )
                        }
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );

  const conteudoDespesas = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Despesas</h2>
            <p>Registre todos os gastos das obras.</p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("despesa")}
          >
            + Despesa
          </button>
        </div>

        {despesas.length === 0 ? (
          <Empty texto="Nenhuma despesa registrada." />
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {despesas.map((despesa) => (
                  <tr key={despesa.id}>
                    <td>{despesa.obra || "-"}</td>
                    <td>{despesa.descricao}</td>
                    <td>{despesa.categoria}</td>
                    <td>{despesa.data || "-"}</td>
                    <td>{dinheiro(despesa.valor)}</td>
                    <td>
                      <button
                        className="danger"
                        onClick={() =>
                          excluir(
                            "despesa",
                            despesa.id
                          )
                        }
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );

  const conteudoPagamentos = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Pagamentos</h2>
            <p>Controle pagamentos feitos e pendentes.</p>
          </div>

          <button
            className="primary"
            onClick={() => setModal("pagamento")}
          >
            + Pagamento
          </button>
        </div>

        {pagamentos.length === 0 ? (
          <Empty texto="Nenhum pagamento cadastrado." />
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {pagamentos.map((pagamento) => (
                  <tr key={pagamento.id}>
                    <td>{pagamento.obra || "-"}</td>
                    <td>{pagamento.descricao}</td>
                    <td>{pagamento.data || "-"}</td>
                    <td>{dinheiro(pagamento.valor)}</td>
                    <td>
                      <span
                        className={`status ${
                          pagamento.status === "Pago"
                            ? "status-concluido"
                            : "status-pendente"
                        }`}
                      >
                        {pagamento.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() =>
                          excluir(
                            "pagamento",
                            pagamento.id
                          )
                        }
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );

  let conteudo = conteudoDashboard;

  if (aba === "Obras") conteudo = conteudoObras;
  if (aba === "Tarefas") conteudo = conteudoTarefas;
  if (aba === "Funcionários")
    conteudo = conteudoFuncionarios;
  if (aba === "Materiais")
    conteudo = conteudoMateriais;
  if (aba === "Despesas")
    conteudo = conteudoDespesas;
  if (aba === "Pagamentos")
    conteudo = conteudoPagamentos;

  return (
    <>
      <style>{estilos}</style>

      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <h1>ObraControl</h1>
            <span>Gerenciamento de obras</span>
          </div>

          <nav className="nav">
            {navegacao.map(([nome, icone]) => (
              <button
                key={nome}
                className={aba === nome ? "active" : ""}
                onClick={() => setAba(nome)}
                title={nome}
                aria-label={nome}
              >
                <span>{icone}</span>
                <label>{nome}</label>
              </button>
            ))}
          </nav>
        </aside>

        <main className="main"><div className="topbar"><span className="onlineDot">● Online</span>{sincronizando && <span className="syncText">Sincronizando...</span>}<span className="userEmail">{sessao.user.email}</span><button className="logoutBtn" onClick={sairDoSistema}>Sair</button></div>{conteudo}</main>
      </div>

      {modal === "obra" && (
        <Modal
          titulo="Nova obra"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <Campo
              label="Nome da obra"
              required
              value={obraForm.nome}
              placeholder="Ex.: Obra do Centro"
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  nome: v,
                }))
              }
            />

            <Campo
              label="Cliente"
              value={obraForm.cliente}
              placeholder="Nome do cliente"
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  cliente: v,
                }))
              }
            />

            <Campo
              label="Local"
              value={obraForm.local}
              placeholder="Endereço ou local"
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  local: v,
                }))
              }
            />

            <Campo
              label="Orçamento"
              value={obraForm.orcamento}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  orcamento: v,
                }))
              }
            />

            <Campo
              label="Data de início"
              type="date"
              value={obraForm.inicio}
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  inicio: v,
                }))
              }
            />

            <Campo
              label="Previsão de término"
              type="date"
              value={obraForm.previsao}
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  previsao: v,
                }))
              }
            />

            <label className="field full">
              <span>Status</span>

              <select
                value={obraForm.status}
                onChange={(e) =>
                  setObraForm((f) => ({
                    ...f,
                    status:
                      e.target.value as Status,
                  }))
                }
              >
                <option>Pendente</option>
                <option>Em andamento</option>
                <option>Concluído</option>
              </select>
            </label>
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

           <button
  className="primary"
  onClick={() => {
    if (obraEditandoId !== null) {
      setObras((lista) =>
        lista.map((obra) =>
          obra.id === obraEditandoId
            ? {
                ...obra,
                nome: obraForm.nome.trim(),
                cliente: obraForm.cliente.trim(),
                local: obraForm.local.trim(),
                inicio: obraForm.inicio,
                previsao: obraForm.previsao,
                orcamento: numero(obraForm.orcamento),
                status: obraForm.status,
              }
            : obra
        )
      );

      setObraEditandoId(null);
      setModal(null);
    } else {
      adicionarObra();
    }
  }}
>
  {obraEditandoId !== null ? "Salvar alterações" : "Salvar obra"}
</button>
          </div>
        </Modal>
      )}

      {modal === "pessoa" && (
        <Modal
          titulo="Novo funcionário"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <Campo
              label="Nome"
              required
              value={pessoaForm.nome}
              placeholder="Nome do funcionário"
              onChange={(v) =>
                setPessoaForm((f) => ({
                  ...f,
                  nome: v,
                }))
              }
            />

            <Campo
              label="Função"
              value={pessoaForm.funcao}
              placeholder="Ex.: Pedreiro"
              onChange={(v) =>
                setPessoaForm((f) => ({
                  ...f,
                  funcao: v,
                }))
              }
            />

            <Campo
              label="Telefone"
              value={pessoaForm.telefone}
              placeholder="(79) 99999-9999"
              type="tel"
              inputMode="tel"
              onChange={(v) =>
                setPessoaForm((f) => ({
                  ...f,
                  telefone: v,
                }))
              }
            />

            <Campo
              label="Valor da diária"
              value={pessoaForm.diaria}
              placeholder="Ex.: 80,00"
              inputMode="decimal"
              onChange={(v) =>
                setPessoaForm((f) => ({
                  ...f,
                  diaria: v,
                }))
              }
            />

            <label className="field">
              <span>Tipo da chave Pix</span>

              <select
                value={pessoaForm.tipoPix}
                onChange={(e) =>
                  setPessoaForm((f) => ({
                    ...f,
                    tipoPix: e.target.value,
                  }))
                }
              >
                <option>CPF</option>
                <option>CNPJ</option>
                <option>Telefone</option>
                <option>E-mail</option>
                <option>Aleatória</option>
              </select>
            </label>

            <Campo
              label="Chave Pix"
              value={pessoaForm.pix}
              placeholder="Digite a chave Pix"
              onChange={(v) =>
                setPessoaForm((f) => ({
                  ...f,
                  pix: v,
                }))
              }
            />
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

            <button
              className="primary"
              onClick={adicionarPessoa}
            >
              Salvar funcionário
            </button>
          </div>
        </Modal>
      )}

      {modal === "detalhesObra" && obraAtual && (
        <Modal
          titulo={`🏗️ ${obraAtual.nome}`}
          fechar={() => setModal(null)}
          largura={800}
        >
          <div>
            <p>
              <strong>Cliente:</strong>{" "}
              {obraAtual.cliente || "-"}
            </p>

            <p>
              <strong>Local:</strong>{" "}
              {obraAtual.local || "-"}
            </p>

            <p>
              <strong>Orçamento:</strong>{" "}
              {dinheiro(obraAtual.orcamento)}
            </p>

            <div className="sectionTitle">
              📊 Progresso geral
            </div>

            <BarraProgresso
              valor={progressoObra(obraAtual)}
            />

            <div className="sectionTitle">
              🧱 Etapas da obra
            </div>

            {(obraAtual.etapas || []).map((etapa) => (
              <div className="etapa" key={etapa.id}>
                <div className="etapaTop">
                  <input
                    className="etapaNomeInput"
                    value={etapa.nome}
                    onChange={(e) =>
                      editarNomeEtapa(
                        obraAtual.id,
                        etapa.id,
                        e.target.value
                      )
                    }
                    style={{
                      flex: 1,
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      padding: 9,
                    }}
                  />

                  <span className="etapaPercentual">
                    {etapa.percentual}%
                  </span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <BarraProgresso
                    valor={etapa.percentual}
                  />
                </div>

                <div className="etapaControls">
                  <button
                    onClick={() =>
                      alterarEtapa(
                        obraAtual.id,
                        etapa.id,
                        etapa.percentual - 10
                      )
                    }
                  >
                    −10
                  </button>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={etapa.percentual}
                    onChange={(e) =>
                      alterarEtapa(
                        obraAtual.id,
                        etapa.id,
                        Number(e.target.value)
                      )
                    }
                  />

                  <button
                    onClick={() =>
                      alterarEtapa(
                        obraAtual.id,
                        etapa.id,
                        etapa.percentual + 10
                      )
                    }
                  >
                    +10
                  </button>

                  <button
                    onClick={() =>
                      alterarEtapa(
                        obraAtual.id,
                        etapa.id,
                        100
                      )
                    }
                  >
                    100%
                  </button>

                  <button
                    className="danger"
                    onClick={() =>
                      excluirEtapa(
                        obraAtual.id,
                        etapa.id
                      )
                    }
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}

            <div className="formGrid" style={{ marginTop: 15 }}>
              <Campo
                label="Nova etapa"
                value={etapaForm.nome}
                placeholder="Ex.: Fundação"
                onChange={(v) =>
                  setEtapaForm((f) => ({
                    ...f,
                    nome: v,
                  }))
                }
              />

              <Campo
                label="Porcentagem inicial"
                value={etapaForm.percentual}
                placeholder="0"
                inputMode="numeric"
                onChange={(v) =>
                  setEtapaForm((f) => ({
                    ...f,
                    percentual: v,
                  }))
                }
              />
            </div>

            <button
              className="secondary"
              style={{ marginTop: 10 }}
              onClick={adicionarEtapa}
            >
              + Adicionar etapa
            </button>

            <div className="sectionTitle">
              👷 Equipe trabalhando nesta obra
            </div>

            {pessoas.length === 0 ? (
              <Empty texto="Cadastre funcionários primeiro." />
            ) : (
              <div className="equipeGrid">
                {pessoas.map((pessoa) => {
                  const selecionado = (
                    obraAtual.equipe || []
                  ).includes(pessoa.id);

                  return (
                    <div
                      className="funcionarioBox"
                      key={pessoa.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() =>
                            alternarPessoaNaObra(
                              obraAtual.id,
                              pessoa.id
                            )
                          }
                        />

                        <strong>{pessoa.nome}</strong>
                      </label>

                      <div className="funcionarioInfo">
                        {pessoa.funcao || "Sem função"} •{" "}
                        {dinheiro(pessoa.diaria)}/dia
                      </div>

                      {pessoa.pix && (
                        <div className="funcionarioInfo pix">
                          💠 {pessoa.pix}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="formActions">
              <button
                className="primary"
                onClick={() => setModal(null)}
              >
                Concluir
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "tarefa" && (
        <Modal
          titulo="Nova tarefa"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <label className="field full">
              <span>Obra</span>

              <select
                value={tarefaForm.obra}
                onChange={(e) =>
                  setTarefaForm((f) => ({
                    ...f,
                    obra: e.target.value,
                  }))
                }
              >
                <option value="">
                  Selecione uma obra
                </option>

                {obras.map((obra) => (
                  <option
                    key={obra.id}
                    value={obra.nome}
                  >
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              label="Descrição"
              required
              value={tarefaForm.descricao}
              placeholder="Ex.: Levantar parede"
              onChange={(v) =>
                setTarefaForm((f) => ({
                  ...f,
                  descricao: v,
                }))
              }
            />

            <Campo
              label="Responsável"
              value={tarefaForm.responsavel}
              placeholder="Nome"
              onChange={(v) =>
                setTarefaForm((f) => ({
                  ...f,
                  responsavel: v,
                }))
              }
            />

            <Campo
              label="Prazo"
              type="date"
              value={tarefaForm.prazo}
              onChange={(v) =>
                setTarefaForm((f) => ({
                  ...f,
                  prazo: v,
                }))
              }
            />

            <label className="field">
              <span>Status</span>

              <select
                value={tarefaForm.status}
                onChange={(e) =>
                  setTarefaForm((f) => ({
                    ...f,
                    status:
                      e.target.value as Status,
                  }))
                }
              >
                <option>Pendente</option>
                <option>Em andamento</option>
                <option>Concluído</option>
              </select>
            </label>
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

            <button
              className="primary"
              onClick={adicionarTarefa}
            >
              Salvar tarefa
            </button>
          </div>
        </Modal>
      )}

      {modal === "material" && (
        <Modal
          titulo="Novo material"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <label className="field">
              <span>Obra</span>

              <select
                value={materialForm.obra}
                onChange={(e) =>
                  setMaterialForm((f) => ({
                    ...f,
                    obra: e.target.value,
                  }))
                }
              >
                <option value="">
                  Selecione uma obra
                </option>

                {obras.map((obra) => (
                  <option
                    key={obra.id}
                    value={obra.nome}
                  >
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              label="Material"
              required
              value={materialForm.nome}
              placeholder="Ex.: Cimento"
              onChange={(v) =>
                setMaterialForm((f) => ({
                  ...f,
                  nome: v,
                }))
              }
            />

            <Campo
              label="Quantidade"
              value={materialForm.quantidade}
              placeholder="0"
              inputMode="decimal"
              onChange={(v) =>
                setMaterialForm((f) => ({
                  ...f,
                  quantidade: v,
                }))
              }
            />

            <label className="field">
              <span>Unidade</span>

              <select
                value={materialForm.unidade}
                onChange={(e) =>
                  setMaterialForm((f) => ({
                    ...f,
                    unidade: e.target.value,
                  }))
                }
              >
                <option>un</option>
                <option>kg</option>
                <option>saco</option>
                <option>m</option>
                <option>m²</option>
                <option>m³</option>
                <option>l</option>
                <option>cx</option>
              </select>
            </label>

            <Campo
              label="Valor unitário"
              value={materialForm.valor}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(v) =>
                setMaterialForm((f) => ({
                  ...f,
                  valor: v,
                }))
              }
            />
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

            <button
              className="primary"
              onClick={adicionarMaterial}
            >
              Salvar material
            </button>
          </div>
        </Modal>
      )}

      {modal === "despesa" && (
        <Modal
          titulo="Nova despesa"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <label className="field">
              <span>Obra</span>

              <select
                value={despesaForm.obra}
                onChange={(e) =>
                  setDespesaForm((f) => ({
                    ...f,
                    obra: e.target.value,
                  }))
                }
              >
                <option value="">
                  Selecione uma obra
                </option>

                {obras.map((obra) => (
                  <option
                    key={obra.id}
                    value={obra.nome}
                  >
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Categoria</span>

              <select
                value={despesaForm.categoria}
                onChange={(e) =>
                  setDespesaForm((f) => ({
                    ...f,
                    categoria: e.target.value,
                  }))
                }
              >
                <option>Material</option>
                <option>Mão de obra</option>
                <option>Transporte</option>
                <option>Ferramentas</option>
                <option>Alimentação</option>
                <option>Outros</option>
              </select>
            </label>

            <Campo
              label="Descrição"
              required
              value={despesaForm.descricao}
              placeholder="Ex.: Compra de cimento"
              onChange={(v) =>
                setDespesaForm((f) => ({
                  ...f,
                  descricao: v,
                }))
              }
            />

            <Campo
              label="Valor"
              value={despesaForm.valor}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(v) =>
                setDespesaForm((f) => ({
                  ...f,
                  valor: v,
                }))
              }
            />

            <Campo
              label="Data"
              type="date"
              value={despesaForm.data}
              onChange={(v) =>
                setDespesaForm((f) => ({
                  ...f,
                  data: v,
                }))
              }
            />
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

            <button
              className="primary"
              onClick={adicionarDespesa}
            >
              Salvar despesa
            </button>
          </div>
        </Modal>
      )}

      {modal === "pagamento" && (
        <Modal
          titulo="Novo pagamento"
          fechar={() => setModal(null)}
        >
          <div className="formGrid">
            <label className="field full">
              <span>Obra</span>

              <select
                value={pagamentoForm.obra}
                onChange={(e) =>
                  setPagamentoForm((f) => ({
                    ...f,
                    obra: e.target.value,
                  }))
                }
              >
                <option value="">
                  Selecione uma obra
                </option>

                {obras.map((obra) => (
                  <option
                    key={obra.id}
                    value={obra.nome}
                  >
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              label="Descrição"
              required
              value={pagamentoForm.descricao}
              placeholder="Ex.: Pagamento do pedreiro"
              onChange={(v) =>
                setPagamentoForm((f) => ({
                  ...f,
                  descricao: v,
                }))
              }
            />

            <Campo
              label="Valor"
              value={pagamentoForm.valor}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(v) =>
                setPagamentoForm((f) => ({
                  ...f,
                  valor: v,
                }))
              }
            />

            <Campo
              label="Data"
              type="date"
              value={pagamentoForm.data}
              onChange={(v) =>
                setPagamentoForm((f) => ({
                  ...f,
                  data: v,
                }))
              }
            />

            <label className="field">
              <span>Status</span>

              <select
                value={pagamentoForm.status}
                onChange={(e) =>
                  setPagamentoForm((f) => ({
                    ...f,
                    status:
                      e.target.value as PagamentoStatus,
                  }))
                }
              >
                <option value="Pendente">
                  Pendente
                </option>

                <option value="Pago">
                  Pago
                </option>
              </select>
            </label>
          </div>

          <div className="formActions">
            <button
              className="cancel"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>

            <button
              className="primary"
              onClick={adicionarPagamento}
            >
              Salvar pagamento
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default App;
