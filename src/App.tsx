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
  percentual: number;
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
*{box-sizing:border-box}html,body,#root{margin:0;width:100%;min-height:100%;}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07111f;color:#e7eef8;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overflow-x:hidden;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;}button,input,select,textarea{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}input,select,textarea{ -webkit-user-select:text; user-select:text; -webkit-touch-callout:default; }
:root{--bg:#07111f;--panel:#0c1929;--panel2:#101f32;--line:#1b3149;--muted:#8192a8;--text:#eaf2fb;--blue:#2388ff;--cyan:#27c7ff;--green:#22c55e;--purple:#8b5cf6;--orange:#f59e0b;--red:#ef476f;--shadow:0 16px 40px rgba(0,0,0,.22)}
.app{min-height:100vh;min-height:100dvh;display:flex;background:radial-gradient(circle at 75% 0%,rgba(22,119,255,.08),transparent 34%),var(--bg);overflow-x:hidden}
.sidebar{position:fixed;inset:0 auto 0 0;width:246px;background:linear-gradient(180deg,#081525 0%,#07111d 100%);border-right:1px solid #172b42;color:#fff;z-index:40;display:flex;flex-direction:column;padding:22px 14px 16px;box-shadow:12px 0 40px rgba(0,0,0,.18)}
.logo{display:flex;align-items:center;gap:11px;padding:4px 10px 24px;border-bottom:1px solid #172b42}.logoMark{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#1686ff,#2bc7ff);box-shadow:0 0 24px rgba(35,136,255,.35);font-size:22px}.logo h1{margin:0;font-size:20px;letter-spacing:-.4px}.logo span{display:block;color:#71849a;font-size:10px;margin-top:2px}.nav{display:flex;flex-direction:column;gap:6px;padding-top:18px;overflow:auto}.nav button{height:45px;width:100%;border:1px solid transparent;background:transparent;color:#8ea1b7;border-radius:11px;display:flex;align-items:center;gap:12px;padding:0 12px;font-size:13px;text-align:left;transition:.2s}.nav button:hover{background:#0d1e31;color:#eaf2fb}.nav button.active{background:linear-gradient(90deg,rgba(31,132,255,.22),rgba(31,132,255,.08));border-color:#155ea8;color:#fff;box-shadow:inset 3px 0 0 #2388ff}.navIcon{width:20px;height:20px;display:grid;place-items:center;color:currentColor}.navLabel{white-space:nowrap}.sidebarFooter{margin-top:auto;border-top:1px solid #172b42;padding:15px 8px 0;display:flex;align-items:center;gap:10px}.avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#1e88ff,#7c3aed);font-size:12px;font-weight:800}.sidebarFooter strong{font-size:12px}.sidebarFooter span{display:block;color:#71849a;font-size:10px;margin-top:2px}
.main{margin-left:246px;width:calc(100% - 246px);min-height:100vh;padding:18px 28px 42px;max-width:none}.topbar{height:48px;display:flex;align-items:center;gap:12px;margin:0 auto 18px;max-width:1420px}.searchBox{height:38px;flex:1;max-width:410px;border:1px solid #203750;background:#0c1929;border-radius:10px;color:#8ca0b6;display:flex;align-items:center;padding:0 13px;font-size:12px}.searchBox input{border:0;outline:0;background:transparent;color:#dce9f5;width:100%;height:100%;font:inherit;padding:0 8px}.searchBox input::placeholder{color:#71869b}.photoActions{display:flex;gap:8px;flex-wrap:wrap}.photoActions button{white-space:nowrap}.topSpacer{flex:1}.topDate{font-size:11px;color:#8da0b5}.bell{width:34px;height:34px;border:1px solid #203750;background:#0c1929;color:#b7c7d8;border-radius:10px}.onlineDot{color:#38d77b;font-size:11px;font-weight:700}.syncText{color:#73879e;font-size:11px}.userEmail{color:#91a3b7;font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logoutBtn{border:1px solid #203750;background:#0c1929;color:#9db0c4;border-radius:9px;padding:7px 10px;font-size:11px}
header{display:flex;justify-content:space-between;align-items:center;gap:15px;margin:0 auto 18px;max-width:1420px}header h1{margin:0;font-size:25px;letter-spacing:-.6px;color:#f1f6fb;line-height:1.15}header span{color:#70849a;font-size:11px}header .primary{flex-shrink:0;white-space:nowrap}
.primary,.secondary,.danger,.close,.cancel{border-radius:9px;padding:10px 14px;font-weight:700;border:1px solid transparent;transition:.18s}.primary{background:linear-gradient(135deg,#187eff,#22a8ff);color:#fff;box-shadow:0 8px 24px rgba(35,136,255,.18)}.primary:hover{filter:brightness(1.08);transform:translateY(-1px)}.secondary{background:#102237;color:#a9c0d8;border-color:#1f3a55}.secondary:hover{border-color:#2b608c;color:#fff}.danger{background:rgba(239,71,111,.1);color:#ff8da8;border-color:rgba(239,71,111,.22);padding:9px 12px}.danger:hover{background:rgba(239,71,111,.17)}.close{width:38px;height:38px;padding:0;font-size:25px;background:#132338;color:#b9c8d8}.cancel{background:#132338;color:#aabbd0;border-color:#203950}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:14px}.card{background:linear-gradient(145deg,#0e1d30,#0b1727);border:1px solid #1b334b;border-radius:13px;padding:16px;display:flex;gap:13px;align-items:center;box-shadow:var(--shadow);transition:.2s;text-align:left;width:100%;color:var(--text)}.card.clickable{cursor:pointer}.card.clickable:hover{transform:translateY(-2px);border-color:#285b83}.cardIcon{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:18px;flex-shrink:0;background:#102b47;color:#48a9ff;border:1px solid #1c4b70}.cardInfo{display:flex;flex-direction:column;gap:3px;min-width:0}.cardInfo span{color:#7f93a9;font-size:11px}.cardInfo strong{font-size:18px;color:#eef5fb;line-height:1.15}
.dashboardGrid{grid-template-columns:repeat(4,minmax(0,1fr));}.dashboardSecondaryGrid{display:none}.dashboardCard:nth-child(2) .cardIcon{background:#0d3027;color:#38d98a;border-color:#195d48}.dashboardCard:nth-child(3) .cardIcon{background:#24183d;color:#b58aff;border-color:#50358a}.dashboardCard:nth-child(4) .cardIcon{background:#3a2a12;color:#ffb13b;border-color:#76521e}.dashboardCard:nth-child(5) .cardIcon{background:#102b47}.dashboardCard:nth-child(6) .cardIcon{background:#3b1b27;color:#ff7895;border-color:#6c2d40}
.panel{background:linear-gradient(145deg,#0c1929,#0a1726);border:1px solid #1a3148;border-radius:14px;padding:18px;margin:0 auto 14px;max-width:1420px;box-shadow:var(--shadow)}.panelHeader{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:16px}.panelHeader h2{margin:0 0 4px;font-size:16px;color:#e9f1f8}.panelHeader p{margin:0;color:#72869c;font-size:11px}.cardsList{display:flex;flex-direction:column;gap:11px}.obrasPastas{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}.obraPasta{overflow:hidden;border:1px solid #1b334b;background:#0d1b2d;border-radius:14px;box-shadow:var(--shadow);transition:.2s}.obraPasta:hover{border-color:#285b83;transform:translateY(-1px)}.obraPastaCapa{position:relative;display:block;width:100%;height:145px;padding:0;border:0;border-bottom:1px solid #1b334b;background:#091725;color:#fff;text-align:left;overflow:hidden;cursor:pointer}.obraPastaCapa img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}.obraPastaSemFoto{position:absolute;inset:0;display:grid;place-items:center;font-size:38px;background:radial-gradient(circle at 50% 35%,#173653,#091725 72%)}.obraPastaCapaSombra{position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,11,19,.08) 15%,rgba(3,11,19,.25) 42%,rgba(3,11,19,.94) 100%)}.obraPastaCapaNome{position:absolute;left:14px;right:14px;bottom:12px;display:flex;flex-direction:column;gap:3px}.obraPastaCapaNome strong{font-size:17px;color:#f1f6fb;line-height:1.15;text-shadow:0 2px 8px rgba(0,0,0,.45)}.obraPastaCapaNome span{font-size:11px;color:#65caff;font-weight:800}.obraPastaCorpo{padding:11px 13px 13px}.obraPastaAcoes{display:flex;gap:7px;flex-wrap:wrap}.obraPastaAcoes .primary{flex:1;min-width:130px}.obraPastaAcoes .status{min-width:125px}.itemCard{border:1px solid #1b334b;background:#0d1b2d;border-radius:12px;padding:15px;display:flex;justify-content:space-between;gap:20px;align-items:center}.itemCard h3{margin:0 0 7px;font-size:14px}.itemCard p{margin:3px 0;color:#7f93a8;font-size:11px}.itemCard strong{display:block;margin-top:7px;font-size:14px}.actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.empty{padding:42px 15px;text-align:center;color:#74879d;display:flex;flex-direction:column;gap:7px}.emptyIcon{font-size:34px}.progress{width:100%;height:8px;background:#15273a;border-radius:20px;overflow:hidden}.progressBar{height:100%;background:linear-gradient(90deg,#1788ff,#2bd1ff);border-radius:20px;transition:width .3s;box-shadow:0 0 14px rgba(35,174,255,.35)}.progressInfo{display:flex;justify-content:flex-end;margin-bottom:5px;color:#35c5ff;font-size:11px}.obraProgress{margin-top:12px;padding-top:12px;border-top:1px solid #1a3046}.etapasResumo{margin-top:12px}.etapaResumo{margin-bottom:9px}.etapaResumoHeader{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;color:#8fa1b4}.etapaResumoHeader strong{color:#39baff}.equipeResumo{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.pessoaTag{background:#132941;color:#77bfff;border:1px solid #20496b;border-radius:20px;padding:5px 9px;font-size:10px;font-weight:700}.obraBotoes{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
/* dashboard visual */
.dashboardHero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.85fr);gap:14px;margin-bottom:14px}.projectCard{position:relative;overflow:hidden;min-height:220px;border:1px solid #1c3953;border-radius:14px;background:#0b1a2b}.projectImage{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.48}.projectShade{position:absolute;inset:0;background:linear-gradient(90deg,#071422 3%,rgba(7,20,34,.92) 38%,rgba(7,20,34,.38) 100%)}.projectContent{position:relative;z-index:1;padding:20px;height:100%;display:flex;flex-direction:column;justify-content:flex-end}.projectContent h3{font-size:18px;margin:0 0 5px}.projectContent p{margin:2px 0;color:#91a5ba;font-size:11px}.projectMiniProgress{width:46%;min-width:170px;height:5px;background:#163047;border-radius:999px;overflow:hidden;margin-top:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}.projectMiniProgressBar{height:100%;border-radius:999px;background:linear-gradient(90deg,#18d9ff,#2388ff);box-shadow:0 0 12px rgba(35,174,255,.55);transition:width .35s ease}.projectMainProgressRow{display:flex;align-items:center;gap:10px;margin-top:7px}.projectMainProgress{flex:1;height:8px;background:#15273a;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}.projectMainProgressBar{height:100%;border-radius:999px;background:linear-gradient(90deg,#16d9d9,#20bfff,#237dff);box-shadow:0 0 14px rgba(35,174,255,.38);transition:width .35s ease}.projectProgressPercent{font-size:13px;font-weight:900;color:#edf7ff;min-width:38px;text-align:right}.projectMeta{display:flex;gap:24px;margin-top:13px}.projectMeta span{display:block;color:#70869d;font-size:9px;text-transform:uppercase;letter-spacing:.5px}.projectMeta strong{display:block;color:#e9f2fa;font-size:12px;margin-top:2px}.projectStatus{display:inline-flex;align-items:center;width:max-content;padding:5px 8px;border-radius:999px;background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.25);color:#53dc86;font-size:10px;font-weight:800;margin-bottom:10px}.dashboardProgress{border:1px solid #1c3953;border-radius:14px;background:#0b1a2b;padding:20px;display:flex;align-items:center;justify-content:center;gap:18px}.donut{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#27c7ff calc(var(--p)*1%),#152a3e 0);position:relative;box-shadow:0 0 28px rgba(39,199,255,.12)}.donut:after{content:"";width:82px;height:82px;border-radius:50%;background:#0b1a2b;position:absolute}.donut span{position:relative;z-index:1;font-size:24px;font-weight:800;color:#eef7ff}.legend{display:flex;flex-direction:column;gap:10px}.legendRow{display:flex;align-items:center;gap:7px;color:#91a5ba;font-size:10px}.dot{width:7px;height:7px;border-radius:50%}.dot.blue{background:#27c7ff}.dot.green{background:#35d989}.dot.orange{background:#ff9f43}.dashboardBottom{display:grid;grid-template-columns:1fr 1fr;gap:14px}.chartBars{height:150px;display:flex;align-items:flex-end;gap:14px;padding:14px 6px 2px}.barCol{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}.bar{width:100%;max-width:38px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#2ab9ff,#176fd8);min-height:6px;box-shadow:0 0 14px rgba(39,199,255,.12)}.barLabel{font-size:9px;color:#70859b}.barValue{font-size:9px;color:#9db0c2}.activityList{display:flex;flex-direction:column}.activity{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #172d43}.activity:last-child{border-bottom:0}.activityIcon{width:28px;height:28px;border-radius:9px;background:#112a42;display:grid;place-items:center;color:#5cbcff;font-size:12px;flex-shrink:0}.activity strong{display:block;font-size:11px;color:#dbe7f2}.activity span{display:block;color:#70859b;font-size:9px;margin-top:2px}
.tarefaProgresso{margin-top:12px;padding-top:11px;border-top:1px solid #1a3046;max-width:520px}.tarefaProgressoHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;color:#8195aa;font-size:10px}.tarefaProgressoHeader strong{color:#35c5ff;font-size:13px}.tarefaControles{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}.tarefaControles button{border:1px solid #24425d;background:#11253a;color:#9ec0da;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:800}.tarefaControles button:active{transform:scale(.97)}.tarefaControles input{width:58px;height:31px;border:1px solid #2a4863;border-radius:7px;background:#091725;color:#eef7ff;text-align:center;font-size:11px;font-weight:800;outline:none}.tarefaControles input:focus{border-color:#258dff;box-shadow:0 0 0 3px rgba(37,141,255,.11)}.progressDashboard{height:9px;margin:3px 0 4px}.progressDashboardInfo{display:flex;justify-content:space-between;gap:10px;color:#70859b;font-size:9px;margin-top:2px}.progressDashboardInfo strong{color:#35c5ff;font-size:12px}.obraProgressHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#8fa1b4;font-size:11px}.obraProgressHeader strong{color:#35c5ff;font-size:13px}.tableWrap{width:100%;overflow-x:auto;border-radius:10px}table{width:100%;border-collapse:collapse;min-width:650px}th,td{padding:12px 10px;border-bottom:1px solid #172c41;text-align:left;font-size:12px;color:#a9b9ca}th{color:#6f8399;font-size:9px;text-transform:uppercase;letter-spacing:.5px}tr:hover td{background:rgba(24,136,255,.025)}.status{border:0;border-radius:20px;padding:6px 9px;font-size:10px;font-weight:700;background:#17283b;color:#a8b8c9}.status-pendente{background:rgba(245,158,11,.12);color:#ffc261}.status-em-andamento{background:rgba(35,136,255,.12);color:#62b5ff}.status-concluido{background:rgba(34,197,94,.12);color:#5be28c}
.modalOverlay{position:fixed;inset:0;z-index:100;background:rgba(1,7,14,.78);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:15px;overflow-y:auto}.modal{background:#0c1929;width:min(700px,100%);max-height:94vh;overflow-y:auto;border:1px solid #23425f;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.55)}.modalHeader{padding:18px 20px;border-bottom:1px solid #1c3349;display:flex;justify-content:space-between;align-items:center;gap:15px}.modalHeader h2{margin:0 0 4px;font-size:18px;color:#eef5fb}.modalHeader span{color:#71859a;font-size:11px}.modalBody{padding:20px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field span{font-size:11px;font-weight:700;color:#a9bacb}.field span b{color:#ff6f8d;margin-left:3px}.field input,.field select{width:100%;border:1px solid #25415b;border-radius:9px;padding:11px;outline:none;background:#0a1726;color:#e7eef8;min-height:43px}.field input::placeholder{color:#52677e}.field input:focus,.field select:focus{border-color:#258dff;box-shadow:0 0 0 3px rgba(37,141,255,.11)}.formActions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.sectionTitle{margin:23px 0 11px;font-size:14px;font-weight:800;color:#dce8f3}.etapa{border:1px solid #1d354c;border-radius:11px;padding:12px;margin-bottom:9px;background:#0b1929}.etapaTop{display:flex;justify-content:space-between;align-items:center;gap:10px}.etapaNome{font-weight:700}.etapaPercentual{font-weight:800;color:#2cc6ff}.etapaControls{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}.etapaControls button{border:1px solid #203b54;background:#12253a;color:#a9bfd2;border-radius:7px;padding:7px 10px;font-weight:800}.etapaControls input{flex:1;min-width:70px;border:1px solid #29445c;border-radius:7px;text-align:center;padding:7px;background:#091725;color:#fff}.obraEtapasEditarBar{display:flex;justify-content:flex-end;margin-top:4px;margin-bottom:8px}.obraEtapasEditarBar .secondary{font-size:11px}.equipeGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.funcionarioBox{border:1px solid #1d354c;border-radius:10px;padding:11px;background:#0b1929}.funcionarioBox label{display:flex;align-items:center;gap:9px;cursor:pointer}.funcionarioBox input{width:17px;height:17px;accent-color:#2388ff}.funcionarioInfo{margin-top:6px;color:#72869b;font-size:10px}.pix{font-family:monospace;font-size:11px;word-break:break-all}.toolSummary{margin-top:14px;padding:12px;border-radius:10px;background:#0a1726;border:1px solid #1c344b;color:#91a4b7;font-size:11px}.muted{font-size:10px;color:#6f8398;margin-top:3px}.photoTools{display:grid;grid-template-columns:1fr 1fr;gap:11px;align-items:end;margin-bottom:13px}.photoTools input[type=file]{width:100%;padding:9px;border:1px dashed #31506b;border-radius:9px;background:#0a1726;color:#91a4b7}.photoGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.photoCard{overflow:hidden;border:1px solid #1c344b;border-radius:11px;background:#0a1726}.photoPreviewButton{display:block;width:100%;padding:0;border:0;background:transparent;border-radius:0;overflow:hidden}.photoCard img{width:100%;height:145px;object-fit:cover;display:block;cursor:zoom-in;transition:transform .2s ease,filter .2s ease}.photoPreviewButton:hover img{transform:scale(1.025);filter:brightness(1.08)}.photoCard>div{padding:9px;display:flex;flex-direction:column;gap:6px}.photoCard small{color:#6f8398}.photoViewer{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px}.photoViewer img{display:block;width:100%;max-height:68vh;object-fit:contain;border-radius:12px;background:#07111f;border:1px solid #1c344b}.photoViewerInfo{width:100%;color:#91a5ba;font-size:11px;text-align:center}.photoViewerInfo strong{display:block;color:#eaf2fb;font-size:13px;margin-bottom:3px}.photoEmpty{padding:18px;border:1px dashed #2a455f;border-radius:10px;color:#71859a;background:#0a1726}.toolUnitTag{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#102941;color:#7ec4ff;border:1px solid #204967;font-size:10px;font-weight:700}.toolLocationSelect{min-width:170px;border:1px solid #25415b;border-radius:8px;padding:8px 9px;background:#0a1726;color:#dbe7f2}.toolUnitRow td{vertical-align:middle}.toolNameCell{min-width:190px}.toolIdCell{white-space:nowrap;font-weight:700}
.authScreen{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(35,136,255,.14),transparent 40%),#06101d}.authCard{width:min(420px,100%);background:#0c1929;border:1px solid #1f3c57;border-radius:20px;padding:30px;box-shadow:0 30px 90px rgba(0,0,0,.45)}.authLogo{width:62px;height:62px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(135deg,#1686ff,#2bc7ff);font-size:28px;margin-bottom:15px;box-shadow:0 0 30px rgba(35,136,255,.25)}.authCard h1{margin:0 0 6px;font-size:25px;color:#eef6ff}.authSubtitle{color:#788da4;margin:0 0 16px;font-size:12px}.authBadge{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.1);color:#54db88;border:1px solid rgba(34,197,94,.18);font-size:11px;font-weight:700;margin-bottom:16px}.authButton{width:100%;margin-top:8px;min-height:46px}.authError{background:rgba(239,71,111,.1);color:#ff8ca5;border:1px solid rgba(239,71,111,.2);padding:10px 11px;border-radius:9px;margin:9px 0;font-size:12px}.authHint{display:block;color:#687e96;line-height:1.45;margin-top:14px;font-size:10px}.authSpinner{width:25px;height:25px;border:3px solid #1c344b;border-top-color:#2cbcff;border-radius:50%;animation:obracontrolSpin .8s linear infinite;margin-top:16px}@keyframes obracontrolSpin{to{transform:rotate(360deg)}}
@media(max-width:1000px){.sidebar{width:76px;padding:18px 10px}.logo{justify-content:center;padding:4px 0 20px}.logoMark{width:40px}.logoText,.navLabel,.sidebarFooter .userText{display:none}.nav button{justify-content:center;padding:0}.main{margin-left:76px;width:calc(100% - 76px);padding:16px}.dashboardGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboardHero{grid-template-columns:1fr}.dashboardBottom{grid-template-columns:1fr}.topDate,.userEmail{display:none}}
@media(max-width:650px){.progressDashboardInfo{font-size:8px}.progressDashboardInfo strong{font-size:11px}.dashboardProgress{justify-content:flex-start}.sidebar{position:fixed;left:0;right:0;top:auto;bottom:0;width:100%;height:68px;padding:7px 8px;background:#081523;border-right:0;border-top:1px solid #1b334b;box-shadow:0 -12px 35px rgba(0,0,0,.35)}.logo,.sidebarFooter{display:none}.nav{padding:0;display:grid;grid-template-columns:repeat(8,1fr);gap:3px;overflow:hidden;width:100%}.nav button{height:54px;border-radius:9px;padding:0;gap:2px;flex-direction:column;font-size:9px}.navIcon{width:20px;height:20px}.navLabel{display:block;font-size:8px;color:inherit}.nav button.active{box-shadow:inset 0 2px 0 #2388ff}.main{margin-left:0;width:100%;padding:12px 10px 84px}.topbar{margin-bottom:13px;height:42px}.searchBox{max-width:none;height:36px}.bell{width:32px;height:32px}.dashboardGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{padding:11px;gap:8px;border-radius:11px}.cardIcon{width:33px;height:33px;border-radius:9px;font-size:15px}.cardInfo span{font-size:9px}.cardInfo strong{font-size:14px}.dashboardHero{gap:9px}.projectCard{min-height:190px}.projectContent{padding:14px}.projectContent h3{font-size:15px}.projectMiniProgress{width:42%;min-width:130px;margin-top:8px}.projectMainProgressRow{gap:8px}.projectMainProgress{height:7px}.projectProgressPercent{font-size:12px;min-width:34px}.projectMeta{gap:15px}.dashboardProgress{padding:15px;gap:14px}.donut{width:92px;height:92px}.donut:after{width:64px;height:64px}.donut span{font-size:18px}.legend{gap:7px}.legendRow{font-size:9px}.dashboardBottom{gap:9px}.chartBars{gap:8px;padding-left:2px;padding-right:2px}.barCol{min-width:0}.barLabel{font-size:8px;text-align:center}.barValue{font-size:8px;text-align:center}.panel{padding:13px;border-radius:11px}.panelHeader h2{font-size:14px}.panelHeader p{font-size:10px}.formGrid{grid-template-columns:1fr}.field.full{grid-column:auto}.itemCard{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions .status{flex:1}.photoTools{grid-template-columns:1fr}.photoGrid{grid-template-columns:1fr 1fr}.photoCard img{height:115px}.obrasPastas{grid-template-columns:1fr}.obraPastaCapa{height:150px}.obraPastaAcoes{gap:6px}.obraPastaAcoes .primary{min-width:0}header{flex-wrap:wrap;gap:7px;margin-bottom:12px}header h1{font-size:21px}header .primary{width:auto}.modalOverlay{align-items:flex-start;padding:8px}.modal{margin-top:3vh}.modalBody{padding:15px}.equipeGrid{grid-template-columns:1fr}}
@media(max-width:390px){.nav button{font-size:8px}.navLabel{font-size:7px}.dashboardGrid{gap:6px}.card{padding:9px}.cardIcon{width:29px;height:29px;font-size:13px}.cardInfo strong{font-size:13px}.main{padding-left:7px;padding-right:7px}}
@media(max-width:700px){
  .photoTools{grid-template-columns:1fr}
  .photoActions{width:100%}
  .photoActions button{flex:1}
  /* Ferramentas: tabela mais compacta no celular, sem alterar a lógica. */
  /* Ferramentas: compacto para TODAS as unidades no celular.
     O desktop permanece exatamente como estava. */
  .toolNameCell{min-width:105px}
  .toolNameCell strong{font-size:10px;white-space:normal;line-height:1.15}
  .toolNameCell .muted{font-size:7.5px;line-height:1.15}
  .toolUnitRow td{padding:7px 5px;font-size:9px;line-height:1.15}
  .toolUnitRow .toolIdCell{min-width:76px}
  .toolUnitTag{padding:3px 6px;font-size:8px;white-space:nowrap}
  .toolLocationSelect{min-width:105px;max-width:125px;padding:5px 6px;font-size:8px}
  .toolUnitRow .actions{gap:4px}
  .toolUnitRow .actions button{padding:5px 6px;font-size:8px}
  .toolUnitRow td:nth-child(2){max-width:105px;word-break:break-word}
  .toolUnitRow td:nth-child(3){max-width:90px}

  /* Obras: centraliza o texto do botão Gerenciar no celular. */
  .obraPastaAcoes .primary{display:flex;align-items:center;justify-content:center;text-align:center;white-space:normal;line-height:1.15}

  /* Materiais, Despesas e Pagamentos: no celular cada registro vira um cartão vertical.
     Os botões de editar/excluir ficam embaixo das informações, como em Funcionários. */
  .tableWrap.mobileFriendlyTable{overflow:visible}
  .mobileFriendlyTable table{min-width:0;width:100%;border-collapse:separate;border-spacing:0 9px}
  .mobileFriendlyTable thead{display:none}
  .mobileFriendlyTable tbody{display:block;width:100%}
  .mobileFriendlyTable tr{display:flex;flex-direction:column;gap:0;border:1px solid #1b334b;border-radius:12px;background:#0d1b2d;overflow:hidden}
  .mobileFriendlyTable td{display:block;width:100%;padding:7px 11px;border:0;font-size:10px;line-height:1.3;word-break:break-word}
  .mobileFriendlyTable td:first-child{padding-top:11px;color:#eef5fb;font-weight:800;font-size:12px}
  .mobileFriendlyTable td:last-child{padding-top:8px;padding-bottom:11px;border-top:1px solid #172c41;margin-top:3px}
  .mobileFriendlyTable .mobileActionButtons{display:flex;gap:7px;width:100%}
  .mobileFriendlyTable .mobileActionButtons button{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:8px 10px}
  .obraEtapasEditarBar{justify-content:center;margin-top:10px}
  .obraEtapasEditarBar .secondary{width:100%;justify-content:center;text-align:center}
}
`;


function IconeNav({ nome }: { nome: string }) {
  const paths: Record<string,string> = {
    Dashboard:"M3 10.5 12 3l9 7.5V21H14v-6h-4v6H3z",
    Obras:"M4 21V8l8-5 8 5v13M8 21v-5h8v5M9 9h.01M15 9h.01M9 12h.01M15 12h.01",
    Tarefas:"M5 4h14v16H5z M8 8h8M8 12h8M8 16h5",
    "Funcionários":"M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 11a2.5 2.5 0 1 0 0-5M18 15a3.5 3.5 0 0 1 3 3.5V20",
    Materiais:"M4 7.5 12 3l8 4.5-8 4.5-8-4.5ZM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5",
    Despesas:"M7 3h10v18H7z M9 7h6M9 11h6M9 15h4",
    Pagamentos:"M5 5h14v14H5z M8 12l2.5 2.5L16 9",
    Ferramentas:"M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L14 12l-2-2 2.7-2.7Z"
  };
  return <span className="navIcon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[nome] || paths.Dashboard}/></svg></span>;
}

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
  const [fotoVisualizando, setFotoVisualizando] = useState<FotoObra | null>(null);
  const [editandoEtapasObra, setEditandoEtapasObra] = useState(false);
  const fotoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement | null>(null);
  const [buscaGlobal, setBuscaGlobal] = useState("");

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
    percentual: "0",
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
  const gravacoesPendentes = useRef(0);
  const filaGravacao = useRef<Promise<void>>(Promise.resolve());
  const dadosRef = useRef<CloudData>({
    obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas,
  } as CloudData);
  const sessaoRef = useRef<AuthSession | null>(null);

  const dadosAtuais = (): CloudData => ({
    obras,
    tarefas,
    pessoas,
    materiais,
    despesas,
    pagamentos,
    ferramentas,
  } as CloudData);

  // Mantém uma cópia dos dados mais recentes fora do ciclo de renderização.
  // Assim, nenhum salvamento usa uma versão antiga do estado.
  useEffect(() => {
    dadosRef.current = dadosAtuais();
  }, [obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas]);

  useEffect(() => {
    sessaoRef.current = sessao;
  }, [sessao]);

  const salvarAlteracaoImediata = (dados: CloudData): Promise<void> => {
    // Primeiro grava no aparelho. Se a internet cair, a alteração continua
    // disponível localmente e será reenviada na próxima sincronização.
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
      const listas: Record<string, unknown> = dados as unknown as Record<string, unknown>;
      for (const chave of ["obras", "tarefas", "pessoas", "materiais", "despesas", "pagamentos", "ferramentas"]) {
        try {
          localStorage.setItem(chave, JSON.stringify(listas[chave] ?? []));
        } catch {
          // O cache individual é apenas compatibilidade; o principal é o v2.
        }
      }
    } catch (erro) {
      console.warn("Não foi possível gravar o cache local:", erro);
    }

    const snapshot = JSON.parse(JSON.stringify(dados)) as CloudData;
    dadosRef.current = snapshot;
    gravacoesPendentes.current += 1;

    const trabalho = async () => {
      try {
        const sessaoAtual = sessaoRef.current;
        if (!sessaoAtual || !cloudPronto) return;
        setSincronizando(true);
        const stamp = await saveCloudData(sessaoAtual, snapshot);
        ultimoServidor.current = stamp;
      } catch (erro) {
        console.error("Falha ao salvar os dados no servidor:", erro);
        throw erro;
      } finally {
        gravacoesPendentes.current = Math.max(0, gravacoesPendentes.current - 1);
        setSincronizando(gravacoesPendentes.current > 0);
      }
    };

    // Todos os salvamentos entram numa fila. Isso impede que, por exemplo,
    // uma obra nova e uma tarefa nova sejam gravadas ao mesmo tempo e uma
    // versão antiga sobrescreva a mais nova no Supabase.
    filaGravacao.current = filaGravacao.current
      .catch(() => undefined)
      .then(trabalho);

    return filaGravacao.current;
  };

  const aplicarDados = (dados: CloudData) => {
    aplicandoDadosRemotos.current = true;

    // Normaliza dados antigos/online antes de colocá-los no estado.
    // Isso evita que um registro incompleto faça a tela quebrar após o login.
    const listaSegura = (valor: unknown): Record<string, unknown>[] =>
      Array.isArray(valor)
        ? valor.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        : [];

    const obrasSeguras: Obra[] = listaSegura(dados?.obras).map((obra, indice) => ({
      id: Number(obra.id) || Date.now() + indice,
      nome: String(obra.nome ?? ""),
      cliente: String(obra.cliente ?? ""),
      local: String(obra.local ?? ""),
      inicio: String(obra.inicio ?? hoje),
      previsao: String(obra.previsao ?? ""),
      orcamento: Number(obra.orcamento) || 0,
      status: (obra.status === "Em andamento" || obra.status === "Concluído" || obra.status === "Pendente")
        ? obra.status
        : "Pendente",
      equipe: Array.isArray(obra.equipe) ? obra.equipe.map(Number).filter(Number.isFinite) : [],
      etapas: Array.isArray(obra.etapas)
        ? obra.etapas.filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((etapa, etapaIndex) => ({
            id: Number(etapa.id) || Date.now() + indice + etapaIndex,
            nome: String(etapa.nome ?? ""),
            percentual: Math.max(0, Math.min(100, Number(etapa.percentual) || 0)),
          }))
        : [],
      fotos: Array.isArray(obra.fotos)
        ? obra.fotos.filter((f): f is Record<string, unknown> => !!f && typeof f === "object").map((foto, fotoIndex) => ({
            id: Number(foto.id) || Date.now() + indice + fotoIndex,
            nome: String(foto.nome ?? "Foto"),
            descricao: String(foto.descricao ?? ""),
            data: String(foto.data ?? hoje),
            url: String(foto.url ?? ""),
          })).filter((foto) => foto.url)
        : [],
    }));

    const tarefasSeguras: Tarefa[] = listaSegura(dados?.tarefas).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      responsavel: String(item.responsavel ?? ""),
      prazo: String(item.prazo ?? ""),
      status: item.status === "Em andamento" || item.status === "Concluído" || item.status === "Pendente" ? item.status : "Pendente",
      percentual: Math.max(0, Math.min(100, Number(item.percentual ?? (item.status === "Concluído" ? 100 : 0)) || 0)),
    }));

    const pessoasSeguras: Pessoa[] = listaSegura(dados?.pessoas).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      nome: String(item.nome ?? ""),
      funcao: String(item.funcao ?? ""),
      telefone: String(item.telefone ?? ""),
      diaria: Number(item.diaria) || 0,
      pix: String(item.pix ?? ""),
      tipoPix: String(item.tipoPix ?? "Aleatória"),
    }));

    const materiaisSeguros: Material[] = listaSegura(dados?.materiais).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      obra: String(item.obra ?? ""),
      nome: String(item.nome ?? ""),
      quantidade: Number(item.quantidade) || 0,
      unidade: String(item.unidade ?? "un"),
      valor: Number(item.valor) || 0,
    }));

    const despesasSeguras: Despesa[] = listaSegura(dados?.despesas).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      categoria: String(item.categoria ?? "Outros"),
      valor: Number(item.valor) || 0,
      data: String(item.data ?? hoje),
    }));

    const pagamentosSeguros: Pagamento[] = listaSegura(dados?.pagamentos).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      valor: Number(item.valor) || 0,
      data: String(item.data ?? hoje),
      status: item.status === "Pago" ? "Pago" : "Pendente",
    }));

    const extras = dados as CloudData & { ferramentas?: Ferramenta[] };
    const ferramentasSeguras: Ferramenta[] = listaSegura(extras?.ferramentas).map((item, indice) => ({
      id: Number(item.id) || Date.now() + indice,
      nome: String(item.nome ?? ""),
      marca: String(item.marca ?? ""),
      modelo: String(item.modelo ?? ""),
      quantidade: Number(item.quantidade) || 1,
      valorUnitario: Number(item.valorUnitario) || 0,
      dataCompra: String(item.dataCompra ?? hoje),
      localizacao: String(item.localizacao ?? "Estoque"),
      obra: String(item.obra ?? ""),
      identificacao: String(item.identificacao ?? ""),
      observacao: String(item.observacao ?? ""),
      unidades: Array.isArray(item.unidades) ? item.unidades as FerramentaUnidade[] : [],
    }));

    setObras(obrasSeguras);
    setTarefas(tarefasSeguras);
    setPessoas(pessoasSeguras);
    setMateriais(materiaisSeguros);
    setDespesas(despesasSeguras);
    setPagamentos(pagamentosSeguros);
    setFerramentas(ferramentasSeguras);
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

    const temporizador = window.setTimeout(() => {
      void salvarAlteracaoImediata(dadosAtuais()).catch(() => undefined);
    }, 500);
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
        if (gravacoesPendentes.current > 0) return;
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

  // Investimento total = tudo que já foi efetivamente lançado como gasto:
  // materiais + despesas + pagamentos realizados. O orçamento continua
  // separado e não entra neste indicador.
  const investimentoTotal = useMemo(() => {
    const materiaisInvestidos = materiais.reduce(
      (total, item) => total + Number(item.quantidade || 0) * Number(item.valor || 0),
      0
    );

    const despesasInvestidas = despesas.reduce(
      (total, item) => total + Number(item.valor || 0),
      0
    );

    const pagamentosInvestidos = pagamentos
      .filter((item) => item.status === "Pago")
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    return materiaisInvestidos + despesasInvestidas + pagamentosInvestidos;
  }, [materiais, despesas, pagamentos]);


  const totalMateriais = useMemo(
    () =>
      materiais.reduce(
        (total, item) => total + item.quantidade * item.valor,
        0
      ),
    [materiais]
  );



  const progressoObra = (obra: Obra) => {
    // Uma obra marcada como concluída representa 100% no Dashboard.
    if (obra.status === "Concluído") return 100;
    if (!obra.etapas || obra.etapas.length === 0) return 0;

    const soma = obra.etapas.reduce(
      (total, etapa) => total + Number(etapa.percentual || 0),
      0
    );

    return Math.max(0, Math.min(100, soma / obra.etapas.length));
  };



  const progressoGeral = useMemo(() => {
    if (obras.length === 0) return 0;
    return obras.reduce((total, obra) => total + progressoObra(obra), 0) / obras.length;
  }, [obras]);

  const obraAtual = obras.find(
    (obra) => obra.id === obraSelecionada
  );

  const excluir = (
    tipo: "obra" | "tarefa" | "pessoa" | "material" | "despesa" | "pagamento" | "ferramenta",
    id: number
  ) => {
    if (!window.confirm("Deseja realmente excluir este item?")) return;

    let novasObras = obras;
    let novasTarefas = tarefas;
    let novasPessoas = pessoas;
    let novosMateriais = materiais;
    let novasDespesas = despesas;
    let novosPagamentos = pagamentos;
    let novasFerramentas = ferramentas;

    if (tipo === "obra") {
      novasObras = obras.filter((item) => item.id !== id);
      if (obraSelecionada === id) { setObraSelecionada(null); setModal(null); }
    } else if (tipo === "tarefa") {
      novasTarefas = tarefas.filter((item) => item.id !== id);
    } else if (tipo === "pessoa") {
      novasPessoas = pessoas.filter((item) => item.id !== id);
      novasObras = obras.map((obra) => ({ ...obra, equipe: (obra.equipe || []).filter((pessoaId) => pessoaId !== id) }));
    } else if (tipo === "material") {
      novosMateriais = materiais.filter((item) => item.id !== id);
    } else if (tipo === "despesa") {
      novasDespesas = despesas.filter((item) => item.id !== id);
    } else if (tipo === "pagamento") {
      novosPagamentos = pagamentos.filter((item) => item.id !== id);
    } else if (tipo === "ferramenta") {
      novasFerramentas = ferramentas.filter((item) => item.id !== id);
    }

    setObras(novasObras);
    setTarefas(novasTarefas);
    setPessoas(novasPessoas);
    setMateriais(novosMateriais);
    setDespesas(novasDespesas);
    setPagamentos(novosPagamentos);
    setFerramentas(novasFerramentas);

    void salvarAlteracaoImediata({
      obras: novasObras, tarefas: novasTarefas, pessoas: novasPessoas,
      materiais: novosMateriais, despesas: novasDespesas,
      pagamentos: novosPagamentos, ferramentas: novasFerramentas,
    } as CloudData);
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
    const novasObras = obraEditandoId === null ? [...obras, nova] : obras.map((item) => item.id === obraEditandoId ? nova : item);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);

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

    const novasPessoas = pessoaEditandoId === null ? [...pessoas, nova] : pessoas.map((item) => item.id === pessoaEditandoId ? nova : item);
    setPessoas(novasPessoas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas: novasPessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);

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
    if (!etapaForm.nome.trim()) { alert("Informe o nome da etapa."); return; }
    const percentual = Math.max(0, Math.min(100, numero(etapaForm.percentual)));
    const novasObras = obras.map((obra) => obra.id === obraAtual.id ? { ...obra, etapas: [...(obra.etapas || []), { id: Date.now(), nome: etapaForm.nome.trim(), percentual }] } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);
    setEtapaForm({ nome: "", percentual: "0" });
  };

  const alterarEtapa = (obraId: number, etapaId: number, percentual: number) => {
    const valor = Math.max(0, Math.min(100, percentual));
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).map((etapa) => etapa.id === etapaId ? { ...etapa, percentual: valor } : etapa) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);
  };

  const editarNomeEtapa = (obraId: number, etapaId: number, nome: string) => {
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).map((etapa) => etapa.id === etapaId ? { ...etapa, nome } : etapa) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);
  };

  const excluirEtapa = (obraId: number, etapaId: number) => {
    if (!window.confirm("Excluir esta etapa?")) return;
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).filter((etapa) => etapa.id !== etapaId) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);
  };

  const alternarPessoaNaObra = (obraId: number, pessoaId: number) => {
    const novasObras = obras.map((obra) => {
      if (obra.id !== obraId) return obra;
      const equipe = obra.equipe || [];
      return equipe.includes(pessoaId) ? { ...obra, equipe: equipe.filter((id) => id !== pessoaId) } : { ...obra, equipe: [...equipe, pessoaId] };
    });
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);
  };

  const mudarStatusObra = (obraId: number, status: Status) => {
    const novasObras = obras.map((obra) =>
      obra.id === obraId ? { ...obra, status } : obra
    );
    setObras(novasObras);
    void salvarAlteracaoImediata({
      obras: novasObras,
      tarefas,
      pessoas,
      materiais,
      despesas,
      pagamentos,
      ferramentas,
    } as CloudData).catch(() => undefined);
  };

  const mudarStatusTarefa = (tarefaId: number, status: Status) => {
    const novasTarefas = tarefas.map((tarefa) => {
      if (tarefa.id !== tarefaId) return tarefa;
      const percentual = status === "Concluído" ? 100 : (status === "Pendente" && tarefa.percentual >= 100 ? 0 : tarefa.percentual);
      return { ...tarefa, status, percentual };
    });
    setTarefas(novasTarefas);
    void salvarAlteracaoImediata({
      obras,
      tarefas: novasTarefas,
      pessoas,
      materiais,
      despesas,
      pagamentos,
      ferramentas,
    } as CloudData).catch(() => undefined);
  };

  const alterarProgressoTarefa = (tarefaId: number, deltaOuValor: number, absoluto = false) => {
    const novasTarefas = tarefas.map((tarefa) => {
      if (tarefa.id !== tarefaId) return tarefa;
      const percentualAtual = Number(tarefa.percentual || 0);
      const percentual = Math.max(0, Math.min(100, absoluto ? deltaOuValor : percentualAtual + deltaOuValor));
      const status = percentual >= 100 ? "Concluído" : percentual > 0 ? "Em andamento" : tarefa.status === "Concluído" ? "Pendente" : tarefa.status;
      return { ...tarefa, percentual, status: status as Status };
    });
    setTarefas(novasTarefas);
    void salvarAlteracaoImediata({ obras, tarefas: novasTarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData).catch(() => undefined);
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
      status: tarefaForm.percentual === "100" ? "Concluído" : tarefaForm.status,
      percentual: Math.max(0, Math.min(100, numero(tarefaForm.percentual))),
    };

    const novasTarefas = tarefaEditandoId === null ? [...tarefas, nova] : tarefas.map((item) => item.id === tarefaEditandoId ? nova : item);
    setTarefas(novasTarefas);
    void salvarAlteracaoImediata({ obras, tarefas: novasTarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudData);

    setTarefaForm({ obra: "", descricao: "", responsavel: "", prazo: "", status: "Pendente", percentual: "0" });
    setTarefaEditandoId(null); setModal(null);
  };

  const editarTarefa = (id: number) => {
    const t = tarefas.find((item) => item.id === id); if (!t) return;
    setTarefaForm({ obra: t.obra || "", descricao: t.descricao || "", responsavel: t.responsavel || "", prazo: t.prazo || "", status: t.status || "Pendente", percentual: String(t.percentual ?? 0) });
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

    const novosMateriais = materialEditandoId === null ? [...materiais, novo] : materiais.map((item) => item.id === materialEditandoId ? novo : item);
    setMateriais(novosMateriais);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais: novosMateriais, despesas, pagamentos, ferramentas } as CloudData);

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

    const novasDespesas = despesaEditandoId === null ? [...despesas, nova] : despesas.map((item) => item.id === despesaEditandoId ? nova : item);
    setDespesas(novasDespesas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas: novasDespesas, pagamentos, ferramentas } as CloudData);

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

    const novosPagamentos = pagamentoEditandoId === null ? [...pagamentos, novo] : pagamentos.map((item) => item.id === pagamentoEditandoId ? novo : item);
    setPagamentos(novosPagamentos);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos: novosPagamentos, ferramentas } as CloudData);

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

    const novasFerramentas = ferramentaEditandoId === null ? [...ferramentas, nova] : ferramentas.map((item) => item.id === ferramentaEditandoId ? nova : item);
    setFerramentas(novasFerramentas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas: novasFerramentas } as CloudData);

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

  const moverUnidadeFerramenta = (ferramentaId: number, unidadeId: string, obra: string) => {
    const novasFerramentas = ferramentas.map((f) => {
      if (f.id !== ferramentaId) return f;
      const unidades = unidadesDaFerramenta(f).map((unidade) => unidade.id === unidadeId ? { ...unidade, obra, localizacao: obra ? `Obra: ${obra}` : "Estoque" } : unidade);
      return { ...f, unidades, quantidade: unidades.length, obra: unidades.length === 1 ? unidades[0].obra : "", localizacao: unidades.length === 1 ? unidades[0].localizacao : "Distribuída entre estoque e obras" };
    });
    setFerramentas(novasFerramentas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas: novasFerramentas } as CloudData);
  };

  const adicionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !obraAtual) return;
    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem.");
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result || "");
      const novasObras = obras.map((obra) =>
        obra.id === obraAtual.id
          ? {
              ...obra,
              fotos: [
                ...(obra.fotos || []),
                {
                  id: Date.now(),
                  nome: arquivo.name,
                  descricao: fotoDescricao.trim(),
                  data: hoje,
                  url,
                },
              ],
            }
          : obra
      );

      setObras(novasObras);
      setFotoDescricao("");
      if (fotoCameraInputRef.current) fotoCameraInputRef.current.value = "";
      if (fotoGaleriaInputRef.current) fotoGaleriaInputRef.current.value = "";

      void salvarAlteracaoImediata({
        obras: novasObras,
        tarefas,
        pessoas,
        materiais,
        despesas,
        pagamentos,
        ferramentas,
      } as CloudData);
    };
    leitor.readAsDataURL(arquivo);
  };

  const excluirFoto = (obraId: number, fotoId: number) => {
    if (!window.confirm("Excluir esta foto?")) return;
    const novasObras = obras.map((obra) =>
      obra.id === obraId
        ? { ...obra, fotos: (obra.fotos || []).filter((foto) => foto.id !== fotoId) }
        : obra
    );
    setObras(novasObras);
    void salvarAlteracaoImediata({
      obras: novasObras,
      tarefas,
      pessoas,
      materiais,
      despesas,
      pagamentos,
      ferramentas,
    } as CloudData);
  };

  const abrirDetalhesObra = (id: number) => {
    setObraSelecionada(id);
    setEditandoEtapasObra(false);
    setFotoVisualizando(null);
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
    ["Dashboard", ""], ["Obras", ""], ["Tarefas", ""], ["Funcionários", ""],
    ["Materiais", ""], ["Despesas", ""], ["Pagamentos", ""], ["Ferramentas", ""],
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

  const despesasPorCategoria = (() => {
    const valorCategoria = (nome: string) =>
      despesas
        .filter((d) => String(d.categoria || "Outros").toLowerCase() === nome.toLowerCase())
        .reduce((total, d) => total + Number(d.valor || 0), 0);

    // O gráfico do Dashboard é fixo nas quatro categorias do layout:
    // Materiais, Mão de obra, Serviços e Outros.
    // Mão de obra representa dinheiro gasto com trabalhadores, não a quantidade
    // de funcionários. A quantidade de funcionários continua nos indicadores.
    const materiais = totalMateriais + valorCategoria("Material");
    const maoDeObra =
      valorCategoria("Mão de obra") +
      pagamentos
        .filter((p) => p.status === "Pago")
        .reduce((total, p) => total + Number(p.valor || 0), 0);

    const servicos =
      valorCategoria("Serviços") +
      valorCategoria("Transporte") +
      valorCategoria("Ferramentas") +
      valorCategoria("Alimentação");

    const outros = valorCategoria("Outros");

    return [
      ["Materiais", materiais],
      ["Mão de obra", maoDeObra],
      ["Serviços", servicos],
      ["Outros", outros],
    ] as [string, number][];
  })();

  const maiorCategoria = Math.max(1, ...despesasPorCategoria.map(([,v]) => v));
  // Atividades do Dashboard são montadas diretamente dos estados atuais.
  // Assim, qualquer inclusão/edição feita nas abas aparece imediatamente aqui,
  // sem depender de recarregar a página.
  const atividades = [
    ...obras.map((o) => ({
      ordem: Number(o.id) || 0,
      icon: "▣",
      title: "Obra cadastrada",
      text: `${o.nome} • ${o.status || "Pendente"}`,
      date: o.inicio || "Hoje",
    })),
    ...tarefas.map((t) => ({
      ordem: Number(t.id) || 0,
      icon: "✓",
      title: "Tarefa registrada",
      text: `${t.descricao} • ${t.status || "Pendente"}`,
      date: t.prazo || "Hoje",
    })),
    ...pessoas.map((p) => ({
      ordem: Number(p.id) || 0,
      icon: "👤",
      title: "Funcionário cadastrado",
      text: `${p.nome} • ${p.funcao || "Profissional"}`,
      date: "Hoje",
    })),
    ...materiais.map((m) => ({
      ordem: Number(m.id) || 0,
      icon: "▣",
      title: "Material adicionado",
      text: `${m.nome} • ${m.quantidade} ${m.unidade}`,
      date: "Hoje",
    })),
    ...despesas.map((d) => ({
      ordem: Number(d.id) || 0,
      icon: "$",
      title: "Despesa registrada",
      text: `${d.descricao} • ${dinheiro(d.valor)}`,
      date: d.data || "Hoje",
    })),
    ...pagamentos.map((p) => ({
      ordem: Number(p.id) || 0,
      icon: "✓",
      title: "Pagamento registrado",
      text: `${p.descricao} • ${dinheiro(p.valor)}`,
      date: p.data || "Hoje",
    })),
  ]
    .sort((a, b) => b.ordem - a.ordem)
    .slice(0, 5);
  const obraDestaque = obras[0];
  const fotoDestaque = obraDestaque?.fotos?.[0]?.url;
  const recebidoDestaque = obraDestaque
    ? pagamentos
        .filter((pagamento) => pagamento.obra === obraDestaque.nome && pagamento.status === "Pago")
        .reduce((total, pagamento) => total + Number(pagamento.valor || 0), 0)
    : 0;

  const dashboardAtualizacaoKey = [
    obras.length,
    tarefas.length,
    pessoas.length,
    materiais.length,
    despesas.length,
    pagamentos.length,
    ferramentas.length,
    Math.round(progressoGeral),
    Math.round(totalMateriais),
  ].join("-");

  const conteudoDashboard = (
    <div key={dashboardAtualizacaoKey}>
      <Header />
      <div className="grid dashboardGrid">
        <button className="card clickable dashboardCard" onClick={() => setAba("Obras")}><div className="cardIcon">▣</div><div className="cardInfo"><span>Total de projetos</span><strong>{obras.length}</strong></div></button>
        <button className="card clickable dashboardCard" onClick={() => setAba("Obras")}><div className="cardIcon">◉</div><div className="cardInfo"><span>Em andamento</span><strong>{obras.filter(o=>o.status==="Em andamento").length}</strong></div></button>
        <button className="card clickable dashboardCard" onClick={() => setAba("Obras")}><div className="cardIcon">✓</div><div className="cardInfo"><span>Concluídas</span><strong>{obras.filter(o=>o.status==="Concluído").length}</strong></div></button>
        <button className="card clickable dashboardCard" onClick={() => setAba("Pagamentos")}><div className="cardIcon">$</div><div className="cardInfo"><span>Investimento total</span><strong>{dinheiro(investimentoTotal)}</strong></div></button>
      </div>
      <div className="dashboardHero">
        <section className="projectCard">
          {fotoDestaque ? <img className="projectImage" src={fotoDestaque} alt="Obra em destaque"/> : <div className="projectImage" style={{background:"linear-gradient(135deg,#173858,#0a1726)"}}/>}
          <div className="projectShade"/>
          <div className="projectContent">
            {obraDestaque ? <>
              <span className="projectStatus">● {obraDestaque.status}</span>
              <h3>{obraDestaque.nome}</h3>
              <p>{obraDestaque.cliente || "Projeto em andamento"} • {obraDestaque.local || "Local não informado"}</p>
              <div className="projectMiniProgress" aria-hidden="true">
                <div className="projectMiniProgressBar" style={{width:`${Math.round(progressoObra(obraDestaque))}%`}} />
              </div>
              <div className="projectMainProgressRow">
                <div className="projectMainProgress" aria-label={`Progresso da obra: ${Math.round(progressoObra(obraDestaque))}%`}>
                  <div className="projectMainProgressBar" style={{width:`${Math.round(progressoObra(obraDestaque))}%`}} />
                </div>
                <strong className="projectProgressPercent">{Math.round(progressoObra(obraDestaque))}%</strong>
              </div>
              <div className="projectMeta">
                <div><span>Orçamento</span><strong>{dinheiro(obraDestaque.orcamento)}</strong></div>
                <div><span>Recebido</span><strong>{dinheiro(recebidoDestaque)}</strong></div>
                <div><span>Início</span><strong>{obraDestaque.inicio || "-"}</strong></div>
              </div>
            </> : <><span className="projectStatus">● Aguardando projeto</span><h3>Nenhuma obra cadastrada</h3><p>Cadastre sua primeira obra para acompanhar o progresso aqui.</p></>}
          </div>
        </section>
        <section className="dashboardProgress">
          <div className="donut" style={{"--p": Math.round(progressoGeral)} as React.CSSProperties}><span>{Math.round(progressoGeral)}%</span></div>
          <div className="legend">
            <strong style={{fontSize:13}}>Progresso geral</strong>
            <div className="progressDashboardInfo"><span>Andamento médio das obras</span><strong>{Math.round(progressoGeral)}%</strong></div>
            <div className="progress progressDashboard"><div className="progressBar" style={{width:`${Math.round(progressoGeral)}%`}} /></div>
            <div className="legendRow"><i className="dot blue"/> Progresso <b style={{marginLeft:"auto",color:"#dbe7f2"}}>{Math.round(progressoGeral)}%</b></div>
            <div className="legendRow"><i className="dot green"/> Em andamento <b style={{marginLeft:"auto",color:"#dbe7f2"}}>{obras.filter(o=>o.status==="Em andamento").length}</b></div>
            <div className="legendRow"><i className="dot orange"/> Pendente <b style={{marginLeft:"auto",color:"#dbe7f2"}}>{obras.filter(o=>o.status==="Pendente").length}</b></div>
          </div>
        </section>
      </div>
      <div className="dashboardBottom">
        <section className="panel" style={{margin:0}}><div className="panelHeader"><div><h2>Despesas por categoria</h2><p>Distribuição dos gastos registrados.</p></div><button className="secondary" onClick={()=>setAba("Despesas")}>Ver detalhes</button></div><div className="chartBars">{despesasPorCategoria.map(([nome,valor], index) => {
          const cores = ["#ff9f43", "#28a9ff", "#35d989", "#9b7cff"];
          return (
            <div className="barCol" key={nome}>
              <span className="barValue">{valor ? dinheiro(valor) : "R$ 0,00"}</span>
              <div
                className="bar"
                style={{
                  height: `${Math.max(7, (valor / maiorCategoria) * 105)}px`,
                  background: `linear-gradient(180deg, ${cores[index]} 0%, ${cores[index]} 100%)`,
                  boxShadow: `0 0 14px ${cores[index]}55`,
                }}
              />
              <span className="barLabel">{nome}</span>
            </div>
          );
        })}</div></section>
        <section className="panel" style={{margin:0}}><div className="panelHeader"><div><h2>Últimas atividades</h2><p>Movimentações recentes do sistema.</p></div></div><div className="activityList">{atividades.length?atividades.map((a,i)=><div className="activity" key={i} style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}><div className="activityIcon">{a.icon}</div><div><strong>{a.title}</strong><span>{a.text} • {a.date}</span></div></div>):<div className="empty" style={{padding:20}}>Nenhuma atividade recente.</div>}</div></section>
      </div>
    </div>
  );

  const obrasFiltradas = buscaGlobal.trim()
    ? obras.filter((obra) =>
        `${obra.nome} ${obra.cliente} ${obra.local}`.toLowerCase().includes(buscaGlobal.trim().toLowerCase())
      )
    : obras;

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
          <div className="obrasPastas">
            {obrasFiltradas.map((obra) => {
              const progresso = Math.round(progressoObra(obra));
              const fotoCapa = obra.fotos?.[0]?.url;

              return (
                <article className="obraPasta" key={obra.id}>
                  <button
                    type="button"
                    className="obraPastaCapa"
                    onClick={() => abrirDetalhesObra(obra.id)}
                    aria-label={`Abrir administração da obra ${obra.nome}`}
                  >
                    {fotoCapa ? (
                      <img src={fotoCapa} alt="" />
                    ) : (
                      <div className="obraPastaSemFoto">🏗️</div>
                    )}
                    <div className="obraPastaCapaSombra" />
                    <div className="obraPastaCapaNome">
                      <strong>{obra.nome}</strong>
                      <span>{progresso}% concluído</span>
                    </div>
                  </button>

                  <div className="obraPastaCorpo">
                    <div className="obraPastaAcoes">
                      <button
                        className="primary"
                        onClick={() => abrirDetalhesObra(obra.id)}
                      >
                        📋 Gerenciar obra
                      </button>

                      <StatusSelect
                        value={obra.status}
                        onChange={(valor) => mudarStatusObra(obra.id, valor)}
                      />

                      <button
                        className="secondary"
                        onClick={() => editarObra(obra.id)}
                      >
                        ✏️ Editar
                      </button>

                      <button
                        className="danger"
                        onClick={() => excluir("obra", obra.id)}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </div>
                </article>
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
                  <div className="tarefaProgresso">
                    <div className="tarefaProgressoHeader"><span>Progresso</span><strong>{Math.round(tarefa.percentual || 0)}%</strong></div>
                    <div className="progress"><div className="progressBar" style={{ width: `${Math.max(0, Math.min(100, tarefa.percentual || 0))}%` }} /></div>
                    <div className="tarefaControles">
                      <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, -10)}>−10%</button>
                      <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, -1)}>−1%</button>
                      <input aria-label={`Progresso de ${tarefa.descricao}`} inputMode="numeric" value={Math.round(tarefa.percentual || 0)} onChange={(e) => alterarProgressoTarefa(tarefa.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)), true)} />
                      <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, 1)}>+1%</button>
                      <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, 10)}>+10%</button>
                    </div>
                  </div>
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
          <div className="tableWrap mobileFriendlyTable">
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
                      <div className="mobileActionButtons">
                        <button className="secondary" onClick={() => editarMaterial(material.id)}>✏️ Editar</button>
                        <button className="danger" onClick={() => excluir("material", material.id)}>🗑️ Apagar</button>
                      </div>
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
          <div className="tableWrap mobileFriendlyTable">
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
                      <div className="mobileActionButtons">
                        <button className="secondary" onClick={() => editarDespesa(despesa.id)}>✏️ Editar</button>
                        <button className="danger" onClick={() => excluir("despesa", despesa.id)}>🗑️ Apagar</button>
                      </div>
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
          <div className="tableWrap mobileFriendlyTable">
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
                      <div className="mobileActionButtons">
                        <button className="secondary" onClick={() => editarPagamento(pagamento.id)}>✏️ Editar</button>
                        <button className="danger" onClick={() => excluir("pagamento", pagamento.id)}>🗑️ Apagar</button>
                      </div>
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

      <div className="app" style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}>
        <aside className="sidebar">
          <div className="logo">
            <div className="logoMark">🏗️</div>
            <div className="logoText"><h1>CGL</h1><span>Gerenciamento de obras</span></div>
          </div>

          <nav className="nav">
            {navegacao.map(([nome]) => (
              <button
                key={nome}
                className={aba === nome ? "active" : ""}
                onClick={() => setAba(nome)}
                title={nome}
                aria-label={nome}
              >
                <IconeNav nome={nome} />
                <span className="navLabel">{nome}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="main"><div className="topbar"><div className="searchBox"><span>⌕</span><input value={buscaGlobal} onChange={(e) => setBuscaGlobal(e.target.value)} onFocus={() => { if (aba !== "Obras") setAba("Obras"); }} placeholder="Buscar projeto..." aria-label="Buscar projeto" /></div><div className="topSpacer"/><span className="topDate">{new Date().toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})}</span><button className="bell" aria-label="Notificações">♢</button><span className="onlineDot">●</span>{sincronizando && <span className="syncText">Sincronizando...</span>}<span className="userEmail">{sessao.user.email}</span><button className="logoutBtn" onClick={sairDoSistema}>Sair</button></div>{conteudo}</main>
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
              onClick={adicionarObra}
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
          fechar={() => { setModal(null); setFotoVisualizando(null); setEditandoEtapasObra(false); }}
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
                  {editandoEtapasObra ? (
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
                  ) : (
                    <strong className="etapaNome">{etapa.nome}</strong>
                  )}

                  <span className="etapaPercentual">
                    {etapa.percentual}%
                  </span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <BarraProgresso valor={etapa.percentual} />
                </div>

                {editandoEtapasObra && (
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
                )}
              </div>
            ))}

            <div className="obraEtapasEditarBar">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditandoEtapasObra((valor) => !valor)}
              >
                {editandoEtapasObra ? "✅ Concluir edição" : "✏️ Editar etapas e progresso"}
              </button>
            </div>

            {editandoEtapasObra && (
              <>
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
              </>
            )}

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
            <div className="photoTools">
              <Campo label="Descrição da foto" value={fotoDescricao} placeholder="Ex.: Parede da frente concluída" onChange={setFotoDescricao} />
              <div className="photoActions">
                <button type="button" className="secondary" onClick={() => fotoCameraInputRef.current?.click()}>📷 Tirar foto</button>
                <button type="button" className="secondary" onClick={() => fotoGaleriaInputRef.current?.click()}>🖼️ Galeria</button>
                <input ref={fotoCameraInputRef} type="file" accept="image/*" capture="environment" onChange={adicionarFoto} style={{display:"none"}} />
                <input ref={fotoGaleriaInputRef} type="file" accept="image/*" onChange={adicionarFoto} style={{display:"none"}} />
              </div>
            </div>
            {(obraAtual.fotos || []).length === 0 ? <div className="photoEmpty">Nenhuma foto adicionada ainda. Tire uma foto ou escolha uma da galeria para registrar o andamento.</div> : <div className="photoGrid">{(obraAtual.fotos || []).map((foto) => <div className="photoCard" key={foto.id}><button type="button" className="photoPreviewButton" onClick={() => setFotoVisualizando(foto)} aria-label={`Visualizar ${foto.descricao || foto.nome}`}><img src={foto.url} alt={foto.descricao || foto.nome} /></button><div><strong>{foto.descricao || foto.nome}</strong><small>{foto.data}</small><button className="danger" onClick={() => excluirFoto(obraAtual.id, foto.id)}>🗑️ Excluir</button></div></div>)}</div>}

            <div className="formActions">
              <button className="primary" onClick={() => { setFotoVisualizando(null); setEditandoEtapasObra(false); setModal(null); }}>Concluir</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "detalhesObra" && fotoVisualizando && (
        <Modal
          titulo="📸 Visualizar foto"
          fechar={() => setFotoVisualizando(null)}
          largura={900}
        >
          <div className="photoViewer">
            <img src={fotoVisualizando.url} alt={fotoVisualizando.descricao || fotoVisualizando.nome} />
            <div className="photoViewerInfo">
              <strong>{fotoVisualizando.descricao || fotoVisualizando.nome}</strong>
              <span>{fotoVisualizando.data}</span>
            </div>
            <div className="formActions" style={{ width: "100%" }}>
              <button className="cancel" onClick={() => setFotoVisualizando(null)}>Fechar</button>
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
              <span>Progresso (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={tarefaForm.percentual}
                onChange={(e) => setTarefaForm((f) => ({ ...f, percentual: String(Math.max(0, Math.min(100, Number(e.target.value) || 0))) }))}
              />
            </label>

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
                <option>Serviços</option>
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

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { erro: Error | null }
> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    console.error("Erro ao renderizar o CGL:", erro);
  }

  render() {
    if (this.state.erro) {
      return (
        <>
          <style>{estilos}</style>
          <div className="authScreen">
            <div className="authCard">
              <div className="authLogo">⚠️</div>
              <h1>O CGL encontrou um problema</h1>
              <p>Seus dados continuam salvos. O erro aconteceu ao montar a tela depois do login.</p>
              <div style={{marginTop:12,padding:12,borderRadius:10,background:"#091522",border:"1px solid #243b52",color:"#ff9eb0",fontSize:11,textAlign:"left",wordBreak:"break-word"}}>
                <strong>Detalhe técnico:</strong><br />
                {this.state.erro.message || "Erro de renderização sem mensagem."}
              </div>
              <button className="primary authButton" onClick={() => window.location.reload()}>
                Recarregar o CGL
              </button>
              <small className="authHint">
                Se o problema continuar, envie esta mensagem junto com o print da tela.
              </small>
            </div>
          </div>
        </>
      );
    }
    return this.props.children;
  }
}

function AppSeguro() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default AppSeguro;
