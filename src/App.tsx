import React, { useEffect, useMemo, useRef, useState } from "react";
import { cloudConfigured, getSession, loadCloudData, login, logout, saveCloudData, type AuthSession, type CloudData } from "./cloud";

type Status = "Pendente" | "Em andamento" | "Concluído";
type PagamentoStatus = "Pago" | "Pendente";

type Etapa = {
  id: number;
  nome: string;
  percentual: number;
};

type FotoObra = {
  id: number;
  nome: string;
  descricao: string;
  data: string;
  url: string;
};

type FerramentaUnidade = {
  id: string;
  identificacao: string;
  obra: string;
  localizacao: string;
};

type Ferramenta = {
  id: number;
  nome: string;
  marca: string;
  modelo: string;
  quantidade: number;
  valorUnitario: number;
  dataCompra: string;
  localizacao: string;
  obra: string;
  identificacao: string;
  observacao: string;
  unidades?: FerramentaUnidade[];
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
  fotos?: FotoObra[];
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

const hoje = (() => {
  const data = new Date();
  const deslocamento = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
})();

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
  flex-direction: column;
}

.sidebar {
  width: 100%;
  min-height: 68px;
  background: #111827;
  color: white;
  position: sticky;
  top: 0;
  z-index: 20;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,.12);
}

.logo {
  flex: 0 0 auto;
  min-width: 58px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1;
}

.logo span {
  display: none;
}

.nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  scrollbar-width: none;
}

.nav::-webkit-scrollbar {
  display: none;
}

.nav button {
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
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
  width: 100%;
  height: 100%;
  font-size: 24px;
  line-height: 1;
}

.main {
  margin-left: 0;
  width: 100%;
  min-height: 100vh;
  padding: 28px;
  box-sizing: border-box;
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
    min-height: 62px;
    padding: 6px 9px;
    gap: 8px;
  }

  .logo {
    min-width: 48px;
  }

  .logo h1 {
    font-size: 21px;
  }

  .nav {
    gap: 5px;
  }

  .nav button {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
  }

  .nav button span {
    font-size: 23px;
  }

  .main {
    margin-left: 0;
    width: 100%;
    padding: 16px;
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .dashboardGrid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .dashboardCard {
    min-height: 78px;
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

.toolSummary{margin-top:16px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb}.muted{font-size:12px;color:#6b7280;margin-top:3px}.photoTools{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end;margin-bottom:14px}.photoTools input[type=file]{width:100%;padding:10px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc}.photoGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}.photoCard{overflow:hidden;border:1px solid #e5e7eb;border-radius:14px;background:#fff}.photoCard img{width:100%;height:150px;object-fit:cover;display:block}.photoCard>div{padding:10px;display:flex;flex-direction:column;gap:6px}.photoCard small{color:#6b7280}.photoEmpty{padding:18px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#f8fafc}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
@media(max-width:700px){.photoTools{grid-template-columns:1fr}.photoGrid{grid-template-columns:1fr 1fr}.photoCard img{height:120px}}
/* Ajustes de layout CGL */
.app { width: 100%; overflow-x: hidden; }
.main { width: calc(100% - 245px); max-width: none; padding: 24px 32px 40px; }
.main > * { width: 100%; max-width: 1400px; margin-left: auto; margin-right: auto; }
header { min-height: 62px; }
header > div:first-child { min-width: 0; }
header h1 { line-height: 1.15; }
header .primary { flex-shrink: 0; white-space: nowrap; }
.panel { width: 100%; }
.panelHeader > div { min-width: 0; }
.panelHeader .primary { flex-shrink: 0; white-space: nowrap; }
.cardsList { width: 100%; }
.itemCard { width: 100%; }
.tableWrap { border-radius: 10px; }
table { min-width: 720px; }
.etapaControls { flex-wrap: wrap; }
.etapaControls input { min-width: 80px; }
.toolUnitTag { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:12px; font-weight:700; }
.toolLocationSelect { min-width:190px; border:1px solid #d1d5db; border-radius:9px; padding:9px 10px; background:#fff; }
.toolUnitRow td { vertical-align: middle; }
.toolNameCell { min-width:190px; }
.toolIdCell { white-space:nowrap; font-weight:700; }
@media (max-width: 900px) {
  .main { width: calc(100% - 72px); padding: 20px; }
}
@media (max-width: 600px) {
  .main { width: calc(100% - 72px); padding: 12px; }
  header { flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  header > div { flex: 1 1 180px; }
  header .primary { flex: 0 0 auto; }
  .panelHeader { flex-wrap: wrap; }
  .panelHeader > div { flex: 1 1 100%; }
  .panel { padding: 14px; }
  .toolLocationSelect { min-width: 150px; max-width: 100%; }
}
@media (max-width: 430px) {
  .main { padding: 10px; }
  header h1 { font-size: 21px; }
  header span { font-size: 12px; }
  header .primary { width: 100%; }
  .panelHeader .primary { width: 100%; }
}

/* Refinamento visual mobile CGL */
.dashboardGrid {
  align-items: stretch;
}
.dashboardCard {
  min-width: 0;
  color: #18212f;
  -webkit-appearance: none;
  appearance: none;
}
.dashboardCard .cardInfo {
  min-width: 0;
  overflow: hidden;
}
.dashboardCard .cardInfo span,
.dashboardCard .cardInfo strong {
  overflow-wrap: anywhere;
  word-break: normal;
}
.dashboardCard .cardInfo strong {
  color: #18212f;
  line-height: 1.15;
}

@media (max-width: 600px) {
  .main {
    padding: 10px 10px 24px;
  }

  header {
    margin-bottom: 12px;
    gap: 8px;
  }

  header h1 {
    font-size: 21px;
  }

  header span {
    font-size: 11px;
  }

  .dashboardGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }

  .dashboardCard {
    min-height: 66px;
    padding: 10px;
    gap: 8px;
    border-radius: 11px;
  }

  .dashboardCard .cardIcon {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    font-size: 16px;
  }

  .dashboardCard .cardInfo {
    gap: 2px;
  }

  .dashboardCard .cardInfo span {
    font-size: 10px;
    line-height: 1.15;
  }

  .dashboardCard .cardInfo strong {
    font-size: 15px;
    line-height: 1.15;
  }

  .dashboardSecondaryGrid {
    margin-top: -6px;
  }

  .dashboardPanel {
    padding: 12px;
    border-radius: 12px;
    margin-bottom: 14px;
  }

  .dashboardPanel .panelHeader {
    margin-bottom: 12px;
    gap: 8px;
  }

  .dashboardPanel .panelHeader h2 {
    font-size: 16px;
  }

  .dashboardPanel .panelHeader p {
    font-size: 11px;
  }

  .dashboardPanel .panelHeader .secondary {
    padding: 8px 10px;
    font-size: 11px;
  }

  .dashboardPanel .itemCard {
    padding: 12px;
    gap: 10px;
    border-radius: 11px;
  }

  .dashboardPanel .itemCard h3 {
    font-size: 14px;
    line-height: 1.25;
    margin-bottom: 6px;
    overflow-wrap: anywhere;
  }

  .dashboardPanel .itemCard p {
    font-size: 11px;
    margin: 3px 0;
  }

  .dashboardPanel .obraProgress {
    margin-top: 10px;
    padding-top: 10px;
  }

  .dashboardPanel .progress {
    height: 8px;
  }

  .dashboardPanel .progressInfo {
    margin-bottom: 3px;
    font-size: 11px;
  }

  .dashboardPanel .itemCard > button {
    align-self: stretch;
    padding: 8px 10px;
    font-size: 11px;
  }
}

@media (max-width: 380px) {
  .main {
    padding: 8px 8px 20px;
  }

  .dashboardGrid {
    gap: 6px;
  }

  .dashboardCard {
    padding: 8px;
    gap: 6px;
    min-height: 60px;
  }

  .dashboardCard .cardIcon {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }

  .dashboardCard .cardInfo span {
    font-size: 9px;
  }

  .dashboardCard .cardInfo strong {
    font-size: 14px;
  }
}
/* ===== CGL: ajuste final de largura e centralização ===== */
.main {
  width: 100% !important;
  max-width: none !important;
  margin-left: 0 !important;
  padding: 22px 20px 36px !important;
  box-sizing: border-box !important;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.main > * {
  width: min(1100px, 100%) !important;
  max-width: 1100px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box;
}

.topbar {
  width: min(1100px, 100%) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

header {
  width: 100%;
}

.dashboardGrid {
  width: 100% !important;
  max-width: 1100px !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  justify-items: stretch;
}

.dashboardPanel {
  width: 100% !important;
  max-width: 1100px !important;
}

.grid .dashboardCard {
  width: 100%;
  min-width: 0;
}

.panel {
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 600px) {
  .main {
    width: 100% !important;
    padding: 14px 10px 28px !important;
  }

  .main > * {
    width: 100% !important;
    max-width: 100% !important;
  }

  .topbar {
    justify-content: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  header {
    width: 100%;
  }

  .dashboardGrid {
    width: 100% !important;
    max-width: 100% !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px;
  }

  .dashboardCard {
    min-width: 0 !important;
  }

  .dashboardPanel {
    width: 100% !important;
    max-width: 100% !important;
  }
}

@media (max-width: 380px) {
  .main {
    padding-left: 8px !important;
    padding-right: 8px !important;
  }

  .dashboardGrid {
    gap: 7px;
  }
}

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

  const [ferramentas, setFerramentas] = useState<Ferramenta[]>(() =>
    ler<Ferramenta>("ferramentas", [])
  );

  const [ferramentaForm, setFerramentaForm] = useState({
    nome: "", marca: "", modelo: "", quantidade: "1", valorUnitario: "",
    dataCompra: hoje, localizacao: "Estoque", obra: "", identificacao: "", observacao: ""
  });
  const [ferramentaEditandoId, setFerramentaEditandoId] = useState<number | null>(null);

  const [pessoaEditandoId, setPessoaEditandoId] = useState<number | null>(null);
  const [tarefaEditandoId, setTarefaEditandoId] = useState<number | null>(null);
  const [materialEditandoId, setMaterialEditandoId] = useState<number | null>(null);
  const [despesaEditandoId, setDespesaEditandoId] = useState<number | null>(null);
  const [pagamentoEditandoId, setPagamentoEditandoId] = useState<number | null>(null);
  const [fotoDescricao, setFotoDescricao] = useState("");
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

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
    ferramentas,
  } as CloudData);

  const aplicarDados = (dados: CloudData) => {
    aplicandoDadosRemotos.current = true;
    setObras(Array.isArray(dados.obras) ? dados.obras as Obra[] : []);
    setTarefas(Array.isArray(dados.tarefas) ? dados.tarefas as Tarefa[] : []);
    setPessoas(Array.isArray(dados.pessoas) ? dados.pessoas as Pessoa[] : []);
    setMateriais(Array.isArray(dados.materiais) ? dados.materiais as Material[] : []);
    setDespesas(Array.isArray(dados.despesas) ? dados.despesas as Despesa[] : []);
    setPagamentos(Array.isArray(dados.pagamentos) ? dados.pagamentos as Pagamento[] : []);
    const extras = dados as CloudData & { ferramentas?: Ferramenta[] };
    setFerramentas(Array.isArray(extras.ferramentas) ? extras.ferramentas : []);
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
  }, [obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, sessao, cloudPronto]);

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

  const totalTarefas = tarefas.length;

  const tarefasConcluidas = useMemo(
    () => tarefas.filter((item) => item.status === "Concluído").length,
    [tarefas]
  );

  const progressoGeral = useMemo(() => {
    if (obras.length === 0) return 0;
    return obras.reduce((total, obra) => total + progressoObra(obra), 0) / obras.length;
  }, [obras]);

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
      | "pagamento"
      | "ferramenta",
    id: number
  ) => {
    if (!window.confirm("Deseja realmente excluir este item?")) return;

    if (tipo === "obra") {
      setObras((lista) => lista.filter((item) => item.id !== id));
      if (obraSelecionada === id) {
        setObraSelecionada(null);
        setModal(null);
      }
    }

    if (tipo === "tarefa") {
      setTarefas((lista) => lista.filter((item) => item.id !== id));
    }

    if (tipo === "pessoa") {
      setPessoas((lista) => lista.filter((item) => item.id !== id));

      setObras((lista) =>
        lista.map((obra) => ({
          ...obra,
          equipe: (obra.equipe || []).filter((pessoaId) => pessoaId !== id),
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
    if (tipo === "ferramenta") {
      setFerramentas((lista) => lista.filter((item) => item.id !== id));
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
    if (aba === "Obras") { setObraEditandoId(null); setObraForm({ nome: "", cliente: "", local: "", inicio: hoje, previsao: "", orcamento: "", status: "Pendente" }); setModal("obra"); }
    else if (aba === "Tarefas") { setTarefaEditandoId(null); setModal("tarefa"); }
    else if (aba === "Funcionários") { setPessoaEditandoId(null); setModal("pessoa"); }
    else if (aba === "Materiais") { setMaterialEditandoId(null); setModal("material"); }
    else if (aba === "Despesas") { setDespesaEditandoId(null); setModal("despesa"); }
    else if (aba === "Pagamentos") { setPagamentoEditandoId(null); setModal("pagamento"); }
    else if (aba === "Ferramentas") { setFerramentaEditandoId(null); setModal("ferramenta"); }
    else setModal("obra");
  };

  const adicionarObra = () => {
    if (!obraForm.nome.trim()) {
      alert("Informe o nome da obra.");
      return;
    }
    
    const anterior = obraEditandoId === null ? undefined : obras.find((item) => item.id === obraEditandoId);
    const nova: Obra = {
      id: obraEditandoId ?? Date.now(), nome: obraForm.nome.trim(), cliente: obraForm.cliente.trim(), local: obraForm.local.trim(), inicio: obraForm.inicio, previsao: obraForm.previsao, orcamento: numero(obraForm.orcamento), status: obraForm.status, equipe: anterior?.equipe || [], etapas: anterior?.etapas || [], fotos: anterior?.fotos || [],
    };
    setObras((lista) => obraEditandoId === null ? [...lista, nova] : lista.map((item) => item.id === obraEditandoId ? nova : item));

    setObraForm({
      nome: "",
      cliente: "",
      local: "",
      inicio: hoje,
      previsao: "",
      orcamento: "",
      status: "Pendente",
    });

    setObraEditandoId(null);
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
      id: pessoaEditandoId ?? Date.now(),
      nome: pessoaForm.nome.trim(),
      funcao: pessoaForm.funcao.trim(),
      telefone: pessoaForm.telefone.trim(),
      diaria: numero(pessoaForm.diaria),
      pix: pessoaForm.pix.trim(),
      tipoPix: pessoaForm.tipoPix,
    };

    setPessoas((lista) => pessoaEditandoId === null ? [...lista, nova] : lista.map((item) => item.id === pessoaEditandoId ? nova : item));

    setPessoaForm({ nome: "", funcao: "", telefone: "", diaria: "", pix: "", tipoPix: "Aleatória" });
    setPessoaEditandoId(null);
    setModal(null);
  };

  const editarPessoa = (id: number) => {
    const p = pessoas.find((item) => item.id === id);
    if (!p) return;
    setPessoaForm({ nome: p.nome || "", funcao: p.funcao || "", telefone: p.telefone || "", diaria: String(p.diaria ?? ""), pix: p.pix || "", tipoPix: p.tipoPix || "Aleatória" });
    setPessoaEditandoId(id); setModal("pessoa");
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
      id: tarefaEditandoId ?? Date.now(),
      obra: tarefaForm.obra,
      descricao: tarefaForm.descricao.trim(),
      responsavel: tarefaForm.responsavel.trim(),
      prazo: tarefaForm.prazo,
      status: tarefaForm.status,
    };

    setTarefas((lista) => tarefaEditandoId === null ? [...lista, nova] : lista.map((item) => item.id === tarefaEditandoId ? nova : item));

    setTarefaForm({ obra: "", descricao: "", responsavel: "", prazo: "", status: "Pendente" });
    setTarefaEditandoId(null); setModal(null);
  };

  const editarTarefa = (id: number) => {
    const t = tarefas.find((item) => item.id === id); if (!t) return;
    setTarefaForm({ obra: t.obra || "", descricao: t.descricao || "", responsavel: t.responsavel || "", prazo: t.prazo || "", status: t.status || "Pendente" });
    setTarefaEditandoId(id); setModal("tarefa");
  };

  const adicionarMaterial = () => {
    if (!materialForm.nome.trim()) {
      alert("Informe o material.");
      return;
    }

    const novo: Material = {
      id: materialEditandoId ?? Date.now(),
      obra: materialForm.obra,
      nome: materialForm.nome.trim(),
      quantidade: numero(materialForm.quantidade),
      unidade: materialForm.unidade,
      valor: numero(materialForm.valor),
    };

    setMateriais((lista) => materialEditandoId === null ? [...lista, novo] : lista.map((item) => item.id === materialEditandoId ? novo : item));

    setMaterialForm({ obra: "", nome: "", quantidade: "", unidade: "un", valor: "" });
    setMaterialEditandoId(null); setModal(null);
  };

  const editarMaterial = (id: number) => {
    const m = materiais.find((item) => item.id === id); if (!m) return;
    setMaterialForm({ obra: m.obra || "", nome: m.nome || "", quantidade: String(m.quantidade ?? ""), unidade: m.unidade || "un", valor: String(m.valor ?? "") });
    setMaterialEditandoId(id); setModal("material");
  };

  const adicionarDespesa = () => {
    if (!despesaForm.descricao.trim()) {
      alert("Informe a descrição da despesa.");
      return;
    }

    const nova: Despesa = {
      id: despesaEditandoId ?? Date.now(),
      obra: despesaForm.obra,
      descricao: despesaForm.descricao.trim(),
      categoria: despesaForm.categoria,
      valor: numero(despesaForm.valor),
      data: despesaForm.data,
    };

    setDespesas((lista) => despesaEditandoId === null ? [...lista, nova] : lista.map((item) => item.id === despesaEditandoId ? nova : item));

    setDespesaForm({ obra: "", descricao: "", categoria: "Material", valor: "", data: hoje });
    setDespesaEditandoId(null); setModal(null);
  };

  const editarDespesa = (id: number) => {
    const d = despesas.find((item) => item.id === id); if (!d) return;
    setDespesaForm({ obra: d.obra || "", descricao: d.descricao || "", categoria: d.categoria || "Material", valor: String(d.valor ?? ""), data: d.data || hoje });
    setDespesaEditandoId(id); setModal("despesa");
  };

  const adicionarPagamento = () => {
    if (!pagamentoForm.descricao.trim()) {
      alert("Informe a descrição do pagamento.");
      return;
    }

    const novo: Pagamento = {
      id: pagamentoEditandoId ?? Date.now(),
      obra: pagamentoForm.obra,
      descricao: pagamentoForm.descricao.trim(),
      valor: numero(pagamentoForm.valor),
      data: pagamentoForm.data,
      status: pagamentoForm.status,
    };

    setPagamentos((lista) => pagamentoEditandoId === null ? [...lista, novo] : lista.map((item) => item.id === pagamentoEditandoId ? novo : item));

    setPagamentoForm({ obra: "", descricao: "", valor: "", data: hoje, status: "Pendente" });
    setPagamentoEditandoId(null); setModal(null);
  };

  const editarPagamento = (id: number) => {
    const p = pagamentos.find((item) => item.id === id); if (!p) return;
    setPagamentoForm({ obra: p.obra || "", descricao: p.descricao || "", valor: String(p.valor ?? ""), data: p.data || hoje, status: p.status || "Pendente" });
    setPagamentoEditandoId(id); setModal("pagamento");
  };

  const unidadesDaFerramenta = (ferramenta: Ferramenta): FerramentaUnidade[] => {
    if (Array.isArray(ferramenta.unidades) && ferramenta.unidades.length > 0) {
      return ferramenta.unidades;
    }

    const quantidade = Math.max(1, Math.round(Number(ferramenta.quantidade || 1)));
    return Array.from({ length: quantidade }, (_, indice) => ({
      id: `${ferramenta.id}-${indice + 1}`,
      identificacao:
        ferramenta.identificacao
          ? quantidade === 1
            ? ferramenta.identificacao
            : `${ferramenta.identificacao} ${String(indice + 1).padStart(2, "0")}`
          : `${ferramenta.nome} ${String(indice + 1).padStart(2, "0")}`,
      obra: ferramenta.obra || "",
      localizacao: ferramenta.obra ? `Obra: ${ferramenta.obra}` : "Estoque",
    }));
  };

  const criarUnidadesFerramenta = (
    ferramenta: Ferramenta,
    quantidadeDesejada: number,
    obraInicial: string,
    identificacaoBase: string
  ): FerramentaUnidade[] => {
    const quantidade = Math.max(1, Math.round(quantidadeDesejada));
    const atuais = unidadesDaFerramenta(ferramenta);
    const unidades = atuais.slice(0, quantidade);

    while (unidades.length < quantidade) {
      const indice = unidades.length + 1;
      unidades.push({
        id: `${ferramenta.id}-${Date.now()}-${indice}`,
        identificacao:
          identificacaoBase
            ? quantidade === 1
              ? identificacaoBase
              : `${identificacaoBase} ${String(indice).padStart(2, "0")}`
            : `${ferramenta.nome} ${String(indice).padStart(2, "0")}`,
        obra: obraInicial,
        localizacao: obraInicial ? `Obra: ${obraInicial}` : "Estoque",
      });
    }

    return unidades.map((unidade, indice) => ({
      ...unidade,
      identificacao:
        quantidade > 1 && identificacaoBase && unidades.length !== 1
          ? `${identificacaoBase} ${String(indice + 1).padStart(2, "0")}`
          : unidade.identificacao || `${ferramenta.nome} ${String(indice + 1).padStart(2, "0")}`,
    }));
  };

  const adicionarFerramenta = () => {
    if (!ferramentaForm.nome.trim()) {
      alert("Informe o nome da ferramenta.");
      return;
    }

    const quantidade = Math.max(
      1,
      Math.round(numero(ferramentaForm.quantidade || "1"))
    );
    const id = ferramentaEditandoId ?? Date.now();
    const ferramentaBase: Ferramenta = {
      id,
      nome: ferramentaForm.nome.trim(),
      marca: ferramentaForm.marca.trim(),
      modelo: ferramentaForm.modelo.trim(),
      quantidade,
      valorUnitario: numero(ferramentaForm.valorUnitario),
      dataCompra: ferramentaForm.dataCompra,
      localizacao: ferramentaForm.obra
        ? `Obra: ${ferramentaForm.obra}`
        : "Estoque",
      obra: ferramentaForm.obra,
      identificacao: ferramentaForm.identificacao.trim(),
      observacao: ferramentaForm.observacao.trim(),
    };

    const anterior =
      ferramentaEditandoId === null
        ? undefined
        : ferramentas.find((item) => item.id === ferramentaEditandoId);

    const unidades = criarUnidadesFerramenta(
      anterior || ferramentaBase,
      quantidade,
      ferramentaForm.obra,
      ferramentaForm.identificacao.trim()
    );

    const nova: Ferramenta = {
      ...ferramentaBase,
      unidades,
      quantidade: unidades.length,
    };

    setFerramentas((lista) =>
      ferramentaEditandoId === null
        ? [...lista, nova]
        : lista.map((item) =>
            item.id === ferramentaEditandoId ? nova : item
          )
    );

    setFerramentaForm({
      nome: "",
      marca: "",
      modelo: "",
      quantidade: "1",
      valorUnitario: "",
      dataCompra: hoje,
      localizacao: "Estoque",
      obra: "",
      identificacao: "",
      observacao: "",
    });
    setFerramentaEditandoId(null);
    setModal(null);
  };

  const editarFerramenta = (id: number) => {
    const f = ferramentas.find((item) => item.id === id);
    if (!f) return;

    const unidades = unidadesDaFerramenta(f);
    const primeira = unidades[0];

    setFerramentaForm({
      nome: f.nome || "",
      marca: f.marca || "",
      modelo: f.modelo || "",
      quantidade: String(unidades.length || f.quantidade || 1),
      valorUnitario: String(f.valorUnitario ?? ""),
      dataCompra: f.dataCompra || hoje,
      localizacao: primeira?.localizacao || f.localizacao || "Estoque",
      obra: primeira?.obra || f.obra || "",
      identificacao: f.identificacao || "",
      observacao: f.observacao || "",
    });
    setFerramentaEditandoId(id);
    setModal("ferramenta");
  };

  const moverUnidadeFerramenta = (
    ferramentaId: number,
    unidadeId: string,
    obra: string
  ) => {
    setFerramentas((lista) =>
      lista.map((f) => {
        if (f.id !== ferramentaId) return f;

        const unidades = unidadesDaFerramenta(f).map((unidade) =>
          unidade.id === unidadeId
            ? {
                ...unidade,
                obra,
                localizacao: obra ? `Obra: ${obra}` : "Estoque",
              }
            : unidade
        );

        return {
          ...f,
          unidades,
          quantidade: unidades.length,
          obra: unidades.length === 1 ? unidades[0].obra : "",
          localizacao:
            unidades.length === 1
              ? unidades[0].localizacao
              : "Distribuída entre estoque e obras",
        };
      })
    );
  };

  const adicionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]; if (!arquivo || !obraAtual) return;
    if (!arquivo.type.startsWith("image/")) { alert("Selecione uma imagem."); return; }
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result || "");
      setObras((lista) => lista.map((obra) => obra.id === obraAtual.id ? { ...obra, fotos: [...(obra.fotos || []), { id: Date.now(), nome: arquivo.name, descricao: fotoDescricao.trim(), data: hoje, url }] } : obra));
      setFotoDescricao("");
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    };
    leitor.readAsDataURL(arquivo);
  };

  const excluirFoto = (obraId: number, fotoId: number) => {
    if (!window.confirm("Excluir esta foto?")) return;
    setObras((lista) => lista.map((obra) => obra.id === obraId ? { ...obra, fotos: (obra.fotos || []).filter((foto) => foto.id !== fotoId) } : obra));
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
    ["Ferramentas", "🛠️"],
  ];

  const Header = () => (
    <header>
      <div>
        <h1>{aba}</h1>
        <span>CGL • gerenciamento de obras e serviços</span>
      </div>

      {aba !== "Dashboard" && (
        <button className="primary" onClick={abrirModalDaAba}>
          + Adicionar
        </button>
      )}
    </header>
  );

  const conteudoDashboard = (
    <>
      <Header />

      <div className="grid dashboardGrid">
        <button
          className="card clickable dashboardCard"
          onClick={() => setAba("Obras")}
        >
          <div className="cardIcon">🏗️</div>
          <div className="cardInfo">
            <span>Obras</span>
            <strong>{obras.length}</strong>
          </div>
        </button>

        <button
          className="card clickable dashboardCard"
          onClick={() => setAba("Obras")}
        >
          <div className="cardIcon">💰</div>
          <div className="cardInfo">
            <span>Orçamento total</span>
            <strong>{dinheiro(totalOrcamento)}</strong>
          </div>
        </button>

        <button
          className="card clickable dashboardCard"
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
          className="card clickable dashboardCard"
          onClick={() => setAba("Funcionários")}
        >
          <div className="cardIcon">👷</div>
          <div className="cardInfo">
            <span>Funcionários</span>
            <strong>{pessoas.length}</strong>
          </div>
        </button>

        <button
          className="card clickable dashboardCard"
          onClick={() => setAba("Pagamentos")}
        >
          <div className="cardIcon">✅</div>
          <div className="cardInfo">
            <span>Pagamentos feitos</span>
            <strong>{dinheiro(totalPago)}</strong>
          </div>
        </button>

        <button
          className="card clickable dashboardCard"
          onClick={() => setAba("Pagamentos")}
        >
          <div className="cardIcon">⏳</div>
          <div className="cardInfo">
            <span>Pagamentos pendentes</span>
            <strong>{dinheiro(totalPendente)}</strong>
          </div>
        </button>
      </div>

      <div className="grid dashboardGrid dashboardSecondaryGrid">
        <button className="card clickable dashboardCard" onClick={() => setAba("Tarefas")}>
          <div className="cardIcon">📋</div>
          <div className="cardInfo">
            <span>Tarefas</span>
            <strong>{totalTarefas}</strong>
          </div>
        </button>

        <button className="card clickable dashboardCard" onClick={() => setAba("Tarefas")}>
          <div className="cardIcon">✅</div>
          <div className="cardInfo">
            <span>Concluídas</span>
            <strong>{tarefasConcluidas}</strong>
          </div>
        </button>

        <button className="card clickable dashboardCard" onClick={() => setAba("Obras")}>
          <div className="cardIcon">📈</div>
          <div className="cardInfo">
            <span>Progresso geral</span>
            <strong>{Math.round(progressoGeral)}%</strong>
          </div>
        </button>
      </div>

      <section className="panel dashboardPanel">
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

                <div className="actions">
                  <button className="secondary" onClick={() => editarPessoa(pessoa.id)}>✏️ Editar</button>
                  <button className="danger" onClick={() => excluir("pessoa", pessoa.id)}>🗑️</button>
                </div>
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

                  <button className="secondary" onClick={() => editarTarefa(tarefa.id)}>✏️ Editar</button>
                  <button className="danger" onClick={() => excluir("tarefa", tarefa.id)}>🗑️</button>
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
                      <button className="secondary" onClick={() => editarMaterial(material.id)}>✏️</button>
                      <button className="danger" onClick={() => excluir("material", material.id)}>🗑️</button>
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
                      <button className="secondary" onClick={() => editarDespesa(despesa.id)}>✏️</button>
                      <button className="danger" onClick={() => excluir("despesa", despesa.id)}>🗑️</button>
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
                      <button className="secondary" onClick={() => editarPagamento(pagamento.id)}>✏️</button>
                      <button className="danger" onClick={() => excluir("pagamento", pagamento.id)}>🗑️</button>
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

  const conteudoFerramentas = (
    <>
      <Header />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>🛠️ Ferramentas</h2>
            <p>
              Controle seu patrimônio e saiba exatamente onde cada unidade
              está.
            </p>
          </div>
        </div>

        {ferramentas.length === 0 ? (
          <Empty texto="Nenhuma ferramenta cadastrada." />
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ferramenta</th>
                  <th>Marca / modelo</th>
                  <th>Unidade</th>
                  <th>Valor</th>
                  <th>Obra / localização</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ferramentas.flatMap((f) => {
                  const unidades = unidadesDaFerramenta(f);

                  return unidades.map((unidade, indice) => (
                    <tr className="toolUnitRow" key={`${f.id}-${unidade.id}`}>
                      <td className="toolNameCell">
                        <strong>🛠️ {f.nome}</strong>
                        {f.observacao && (
                          <div className="muted">{f.observacao}</div>
                        )}
                        {unidades.length > 1 && (
                          <div className="muted">
                            {indice + 1} de {unidades.length} unidades
                          </div>
                        )}
                      </td>

                      <td>
                        {f.marca || "-"}
                        {f.modelo ? ` / ${f.modelo}` : ""}
                      </td>

                      <td className="toolIdCell">
                        <span className="toolUnitTag">
                          {unidade.identificacao}
                        </span>
                      </td>

                      <td>{dinheiro(f.valorUnitario)}</td>

                      <td>
                        <select
                          className="toolLocationSelect"
                          value={unidade.obra}
                          onChange={(e) =>
                            moverUnidadeFerramenta(
                              f.id,
                              unidade.id,
                              e.target.value
                            )
                          }
                        >
                          <option value="">Estoque</option>
                          {obras.map((obra) => (
                            <option key={obra.id} value={obra.nome}>
                              {obra.nome}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <div className="actions">
                          <button
                            className="secondary"
                            onClick={() => editarFerramenta(f.id)}
                          >
                            ✏️
                          </button>
                          <button
                            className="danger"
                            onClick={() => excluir("ferramenta", f.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}

        {ferramentas.length > 0 && (
          <div className="toolSummary">
            <strong>
              {ferramentas.reduce(
                (n, f) => n + unidadesDaFerramenta(f).length,
                0
              )}
            </strong>{" "}
            unidades cadastradas • patrimônio:{" "}
            <strong>
              {dinheiro(
                ferramentas.reduce(
                  (n, f) =>
                    n + unidadesDaFerramenta(f).length * f.valorUnitario,
                  0
                )
              )}
            </strong>
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
  if (aba === "Ferramentas")
    conteudo = conteudoFerramentas;

  return (
    <>
      <style>{estilos}</style>

      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <h1>CGL</h1>
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
              </button>
            ))}
          </nav>
        </aside>

        <main className="main"><div className="topbar"><span className="onlineDot">● Online</span>{sincronizando && <span className="syncText">Sincronizando...</span>}<span className="userEmail">{sessao.user.email}</span><button className="logoutBtn" onClick={sairDoSistema}>Sair</button></div>{conteudo}</main>
      </div>

      {modal === "obra" && (
        <Modal
          titulo={obraEditandoId === null ? "Nova obra" : "Editar obra"}
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
          titulo={pessoaEditandoId === null ? "Novo funcionário" : "Editar funcionário"}
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
              {pessoaEditandoId === null ? "Salvar funcionário" : "Salvar alterações"}
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

            <div className="sectionTitle">📸 Fotos e progresso da obra</div>
            <div className="photoTools"><Campo label="Descrição da foto" value={fotoDescricao} placeholder="Ex.: Parede da frente concluída" onChange={setFotoDescricao} /><input ref={fotoInputRef} type="file" accept="image/*" capture="environment" onChange={adicionarFoto} /></div>
            {(obraAtual.fotos || []).length === 0 ? <div className="photoEmpty">Nenhuma foto adicionada ainda. Tire uma foto ou escolha uma da galeria para registrar o andamento.</div> : <div className="photoGrid">{(obraAtual.fotos || []).map((foto) => <div className="photoCard" key={foto.id}><img src={foto.url} alt={foto.descricao || foto.nome} /><div><strong>{foto.descricao || foto.nome}</strong><small>{foto.data}</small><button className="danger" onClick={() => excluirFoto(obraAtual.id, foto.id)}>🗑️ Excluir</button></div></div>)}</div>}

            <div className="formActions">
              <button className="primary" onClick={() => setModal(null)}>Concluir</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "tarefa" && (
        <Modal
          titulo={tarefaEditandoId === null ? "Nova tarefa" : "Editar tarefa"}
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
              {tarefaEditandoId === null ? "Salvar tarefa" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "material" && (
        <Modal
          titulo={materialEditandoId === null ? "Novo material" : "Editar material"}
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
              {materialEditandoId === null ? "Salvar material" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "despesa" && (
        <Modal
          titulo={despesaEditandoId === null ? "Nova despesa" : "Editar despesa"}
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
              {despesaEditandoId === null ? "Salvar despesa" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "ferramenta" && (
        <Modal titulo={ferramentaEditandoId === null ? "Nova ferramenta" : "Editar ferramenta"} fechar={() => { setModal(null); setFerramentaEditandoId(null); }} largura={760}>
          <div className="formGrid">
            <Campo label="Ferramenta" required value={ferramentaForm.nome} placeholder="Ex.: Furadeira" onChange={(v) => setFerramentaForm(f => ({...f, nome:v}))} />
            <Campo label="Marca" value={ferramentaForm.marca} placeholder="Ex.: Bosch" onChange={(v) => setFerramentaForm(f => ({...f, marca:v}))} />
            <Campo label="Modelo" value={ferramentaForm.modelo} placeholder="Modelo" onChange={(v) => setFerramentaForm(f => ({...f, modelo:v}))} />
            <Campo label="Quantidade" value={ferramentaForm.quantidade} inputMode="numeric" onChange={(v) => setFerramentaForm(f => ({...f, quantidade:v}))} />
            <Campo label="Valor pago por unidade" value={ferramentaForm.valorUnitario} inputMode="decimal" placeholder="0,00" onChange={(v) => setFerramentaForm(f => ({...f, valorUnitario:v}))} />
            <Campo label="Data da compra" type="date" value={ferramentaForm.dataCompra} onChange={(v) => setFerramentaForm(f => ({...f, dataCompra:v}))} />
            <label className="field"><span>Obra / localização</span><select value={ferramentaForm.obra} onChange={(e) => setFerramentaForm(f => ({...f, obra:e.target.value, localizacao:e.target.value ? `Obra: ${e.target.value}` : "Estoque"}))}><option value="">Estoque</option>{obras.map(o => <option key={o.id} value={o.nome}>{o.nome}</option>)}</select></label>
            <Campo label="Identificação / prefixo" value={ferramentaForm.identificacao} placeholder="Ex.: Furadeira Bosch" onChange={(v) => setFerramentaForm(f => ({...f, identificacao:v}))} />
            <Campo label="Observação" value={ferramentaForm.observacao} placeholder="Estado, acessórios, etc." onChange={(v) => setFerramentaForm(f => ({...f, observacao:v}))} />
          </div>
          <div className="toolSummary">
            <strong>Distribuição por unidade:</strong> se cadastrar 2 furadeiras,
            cada uma receberá uma identificação própria (01 e 02). Depois de
            salvar, você poderá colocar cada unidade em uma obra diferente.
          </div>
          <div className="formActions"><button className="cancel" onClick={() => { setModal(null); setFerramentaEditandoId(null); }}>Cancelar</button><button className="primary" onClick={adicionarFerramenta}>{ferramentaEditandoId === null ? "Salvar ferramenta" : "Salvar alterações"}</button></div>
        </Modal>
      )}

      {modal === "pagamento" && (
        <Modal
          titulo={pagamentoEditandoId === null ? "Novo pagamento" : "Editar pagamento"}
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
              {pagamentoEditandoId === null ? "Salvar pagamento" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default App;
