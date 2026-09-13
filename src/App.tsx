import React, { useEffect, useMemo, useRef, useState } from "react";
import { cloudConfigured, getSession, loadCloudData, login, logout, saveCloudData, type AuthSession, type CloudData } from "./cloud";

type Status = "Pendente" | "Em andamento" | "Concluído";

// IDs locais: evitam colisões quando várias inclusões acontecem no mesmo milissegundo.
let sequenciaId = 0;
const novoId = () => Date.now() * 1000 + (++sequenciaId % 1000);
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

type FotoDiarioObra = {
  id: number;
  nome: string;
  descricao: string;
  url: string;
  data: string;
};

type DiarioObra = {
  id: number;
  obra: string;
  data: string;
  titulo: string;
  descricao: string;
  etapa: string;
  observacao: string;
  fotos: FotoDiarioObra[];
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
  recebido: number;
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
  cpf?: string;
  endereco?: string;
  diasTrabalhados?: Record<string, boolean>;
  semanasGerenciadas?: string[];
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

type RegistroPagamento = {
  id: number;
  funcionarioId: number;
  nomeFuncionario: string;
  valor: number;
  diasTrabalhados: number;
  semanaInicio: string;
  semanaFim: string;
  dataPagamento: string;
  diasChaves?: string[];
};

type CloudDataComHistorico = CloudData & { registrosPagamentos?: RegistroPagamento[]; diarioObra?: DiarioObra[] };

type Pagamento = {
  id: number;
  obra: string;
  descricao: string;
  valor: number;
  data: string;
  status: PagamentoStatus;
  // Preenchidos automaticamente quando o pagamento vem do controle semanal do funcionário.
  funcionarioId?: number;
  semanaInicio?: string;
  semanaFim?: string;
  diasTrabalhados?: number;
  origem?: "diarias" | "manual";
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

const numero = (valor: string | number | null | undefined) => {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  let texto = String(valor ?? "").trim().replace(/\s/g, "");
  if (!texto) return 0;

  // Aceita tanto o padrão brasileiro (1.234,56) quanto o decimal
  // digitado com ponto (1234.56). O parser antigo removia TODOS os
  // pontos, fazendo 100.00 virar 10000 (R$ 10.000,00).
  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");

  if (temVirgula && temPonto) {
    // O último separador é tratado como decimal.
    const ultimaVirgula = texto.lastIndexOf(",");
    const ultimoPonto = texto.lastIndexOf(".");
    const separadorDecimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const separadorMilhar = separadorDecimal === "," ? "." : ",";
    texto = texto.split(separadorMilhar).join("");
    texto = texto.replace(separadorDecimal, ".");
  } else if (temVirgula) {
    // No CGL, vírgula é o separador decimal.
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    const partes = texto.split(".");
    const ultimaParte = partes[partes.length - 1] || "";
    // 100.00 / 1.5 = decimal; 100.000 / 1.500 = milhar.
    // Isso mantém a digitação brasileira de valores altos sem quebrar
    // quem digita o valor com ponto decimal no teclado do celular.
    if (partes.length === 2 && /^\d{1,2}$/.test(ultimaParte)) {
      // Já está no formato decimal.
    } else {
      texto = partes.join("");
    }
  }

  const n = Number(texto);
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
.tarefaProgresso{margin-top:12px;padding-top:11px;border-top:1px solid #1a3046;max-width:520px}.tarefaProgressoHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;color:#8195aa;font-size:10px}.tarefaProgressoHeader strong{color:#35c5ff;font-size:13px}.tarefaControles{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}.tarefaControles button{border:1px solid #24425d;background:#11253a;color:#9ec0da;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:800}.tarefaControles button:active{transform:scale(.97)}.tarefaControles input{width:58px;height:31px;border:1px solid #2a4863;border-radius:7px;background:#091725;color:#eef7ff;text-align:center;font-size:11px;font-weight:800;outline:none}.tarefaControles input:focus{border-color:#258dff;box-shadow:0 0 0 3px rgba(37,141,255,.11)}.progressDashboard{height:9px;margin:3px 0 4px}.progressDashboardInfo{display:flex;justify-content:space-between;gap:10px;color:#70859b;font-size:9px;margin-top:2px}.progressDashboardInfo strong{color:#35c5ff;font-size:12px}.obraProgressHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#8fa1b4;font-size:11px}.obraProgressHeader strong{color:#35c5ff;font-size:13px}.tableWrap{width:100%;overflow-x:auto;border-radius:10px}table{width:100%;border-collapse:collapse;min-width:650px}th,td{padding:12px 10px;border-bottom:1px solid #172c41;text-align:left;font-size:12px;color:#a9b9ca}th{color:#6f8399;font-size:9px;text-transform:uppercase;letter-spacing:.5px}tr:hover td{background:rgba(24,136,255,.025)}.status{border:0;border-radius:20px;padding:6px 9px;font-size:10px;font-weight:700;background:#17283b;color:#a8b8c9}.status-pendente{background:rgba(245,158,11,.12);color:#ffc261}.status-em-andamento{background:rgba(35,136,255,.12);color:#62b5ff}.status-concluido{background:rgba(34,197,94,.12);color:#5be28c}.pagamentoStatusBtn{border:0;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;transition:transform .15s ease,filter .15s ease;min-width:108px}.pagamentoStatusBtn:hover{filter:brightness(1.08);transform:translateY(-1px)}.pagamentoStatusBtn.pago{background:rgba(34,197,94,.16);color:#5be28c}.pagamentoStatusBtn.pendente{background:rgba(245,158,11,.16);color:#ffc261}
.modalOverlay{position:fixed;inset:0;z-index:100;background:rgba(1,7,14,.78);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:15px;overflow-y:auto}.modal{background:#0c1929;width:min(700px,100%);max-height:94vh;overflow-y:auto;border:1px solid #23425f;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.55)}.modalHeader{padding:18px 20px;border-bottom:1px solid #1c3349;display:flex;justify-content:space-between;align-items:center;gap:15px}.modalHeader h2{margin:0 0 4px;font-size:18px;color:#eef5fb}.modalHeader span{color:#71859a;font-size:11px}.modalBody{padding:20px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field span{font-size:11px;font-weight:700;color:#a9bacb}.field span b{color:#ff6f8d;margin-left:3px}.field input,.field select{width:100%;border:1px solid #25415b;border-radius:9px;padding:11px;outline:none;background:#0a1726;color:#e7eef8;min-height:43px}.field input::placeholder{color:#52677e}.field input:focus,.field select:focus{border-color:#258dff;box-shadow:0 0 0 3px rgba(37,141,255,.11)}.formActions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.sectionTitle{margin:23px 0 11px;font-size:14px;font-weight:800;color:#dce8f3}.etapa{border:1px solid #1d354c;border-radius:11px;padding:12px;margin-bottom:9px;background:#0b1929}.etapaTop{display:flex;justify-content:space-between;align-items:center;gap:10px}.etapaNome{font-weight:700}.etapaPercentual{font-weight:800;color:#2cc6ff}.etapaControls{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}.etapaControls button{border:1px solid #203b54;background:#12253a;color:#a9bfd2;border-radius:7px;padding:7px 10px;font-weight:800}.etapaControls input{flex:1;min-width:70px;border:1px solid #29445c;border-radius:7px;text-align:center;padding:7px;background:#091725;color:#fff}.obraEtapasEditarBar{display:flex;justify-content:flex-end;margin-top:4px;margin-bottom:8px}.obraEtapasEditarBar .secondary{font-size:11px}.equipeGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.funcionarioBox{border:1px solid #1d354c;border-radius:10px;padding:11px;background:#0b1929}.funcionarioBox label{display:flex;align-items:center;gap:9px;cursor:pointer}.funcionarioBox input{width:17px;height:17px;accent-color:#2388ff}.funcionarioInfo{margin-top:6px;color:#72869b;font-size:10px}.pix{font-family:monospace;font-size:11px;word-break:break-all}.toolSummary{margin-top:14px;padding:12px;border-radius:10px;background:#0a1726;border:1px solid #1c344b;color:#91a4b7;font-size:11px}.muted{font-size:10px;color:#6f8398;margin-top:3px}.photoTools{display:grid;grid-template-columns:1fr 1fr;gap:11px;align-items:end;margin-bottom:13px}.photoTools input[type=file]{width:100%;padding:9px;border:1px dashed #31506b;border-radius:9px;background:#0a1726;color:#91a4b7}.photoGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.photoCard{overflow:hidden;border:1px solid #1c344b;border-radius:11px;background:#0a1726}.photoPreviewButton{display:block;width:100%;padding:0;border:0;background:transparent;border-radius:0;overflow:hidden}.photoCard img{width:100%;height:145px;object-fit:cover;display:block;cursor:zoom-in;transition:transform .2s ease,filter .2s ease}.photoPreviewButton:hover img{transform:scale(1.025);filter:brightness(1.08)}.photoCard>div{padding:9px;display:flex;flex-direction:column;gap:6px}.photoCard small{color:#6f8398}.photoViewer{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px}.photoViewer img{display:block;width:100%;max-height:68vh;object-fit:contain;border-radius:12px;background:#07111f;border:1px solid #1c344b}.photoViewerInfo{width:100%;color:#91a5ba;font-size:11px;text-align:center}.photoViewerInfo strong{display:block;color:#eaf2fb;font-size:13px;margin-bottom:3px}.photoEmpty{padding:18px;border:1px dashed #2a455f;border-radius:10px;color:#71859a;background:#0a1726}.toolUnitTag{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#102941;color:#7ec4ff;border:1px solid #204967;font-size:10px;font-weight:700}.toolLocationSelect{min-width:170px;border:1px solid #25415b;border-radius:8px;padding:8px 9px;background:#0a1726;color:#dbe7f2}.toolUnitRow td{vertical-align:middle}.toolNameCell{min-width:190px}.toolIdCell{white-space:nowrap;font-weight:700}
.authScreen{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(35,136,255,.14),transparent 40%),#06101d}.authCard{width:min(420px,100%);background:#0c1929;border:1px solid #1f3c57;border-radius:20px;padding:30px;box-shadow:0 30px 90px rgba(0,0,0,.45)}.authLogo{width:62px;height:62px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(135deg,#1686ff,#2bc7ff);font-size:28px;margin-bottom:15px;box-shadow:0 0 30px rgba(35,136,255,.25)}.authCard h1{margin:0 0 6px;font-size:25px;color:#eef6ff}.authSubtitle{color:#788da4;margin:0 0 16px;font-size:12px}.authBadge{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.1);color:#54db88;border:1px solid rgba(34,197,94,.18);font-size:11px;font-weight:700;margin-bottom:16px}.authButton{width:100%;margin-top:8px;min-height:46px}.authError{background:rgba(239,71,111,.1);color:#ff8ca5;border:1px solid rgba(239,71,111,.2);padding:10px 11px;border-radius:9px;margin:9px 0;font-size:12px}.authHint{display:block;color:#687e96;line-height:1.45;margin-top:14px;font-size:10px}.authSpinner{width:25px;height:25px;border:3px solid #1c344b;border-top-color:#2cbcff;border-radius:50%;animation:obracontrolSpin .8s linear infinite;margin-top:16px}@keyframes obracontrolSpin{to{transform:rotate(360deg)}}

.diasSemanaGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.semanaPessoaBloco + .semanaPessoaBloco{margin-top:18px;padding-top:4px;border-top:1px solid #dce7f2}.adicionarSemanaPessoa{width:100%;margin-top:14px;padding:12px 16px;background:#eef9ff!important;border:1px solid #bfe4f5!important;color:#147fa8!important;font-weight:800!important;border-radius:11px}.adicionarSemanaPessoa:hover{background:#e1f5ff!important}.diaTrabalho{border:1px solid #24415b;border-radius:11px;background:#0b1929;color:#dbe7f2;padding:11px 7px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;min-height:105px}.diaTrabalho strong{font-size:11px}.diaTrabalho span{font-size:9px;color:#72869b}.diaTrabalho b{font-size:9px}.diaTrabalho.trabalhou{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.42);color:#71e49a}.diaTrabalho.naoTrabalhou{opacity:.82}.resumoDiarias{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px}.resumoDiarias>div{padding:12px;border:1px solid #1d354c;border-radius:10px;background:#0a1726}.resumoDiarias span{display:block;color:#71869c;font-size:9px}.resumoDiarias strong{display:block;color:#eef5fb;font-size:16px;margin-top:4px}.resumoDiarias>div:last-child strong{color:#42d985}
@media(max-width:1000px){.sidebar{width:76px;padding:18px 10px}.logo{justify-content:center;padding:4px 0 20px}.logoMark{width:40px}.logoText,.navLabel,.sidebarFooter .userText{display:none}.nav button{justify-content:center;padding:0}.main{margin-left:76px;width:calc(100% - 76px);padding:16px}.dashboardGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboardHero{grid-template-columns:1fr}.dashboardBottom{grid-template-columns:1fr}.topDate,.userEmail{display:none}}
@media(max-width:650px){.progressDashboardInfo{font-size:8px}.progressDashboardInfo strong{font-size:11px}.dashboardProgress{justify-content:flex-start}.sidebar{position:fixed;left:0;right:0;top:auto;bottom:0;width:100%;height:68px;padding:7px 8px;background:#081523;border-right:0;border-top:1px solid #1b334b;box-shadow:0 -12px 35px rgba(0,0,0,.35)}.logo,.sidebarFooter{display:none}.nav{padding:0;display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:3px;overflow:hidden;width:100%}.nav button{height:54px;border-radius:9px;padding:0;gap:2px;flex-direction:column;font-size:9px}.navIcon{width:20px;height:20px}.navLabel{display:block;font-size:8px;color:inherit}.nav button.active{box-shadow:inset 0 2px 0 #2388ff}.main{margin-left:0;width:100%;padding:12px 10px 84px}.topbar{margin-bottom:13px;height:42px}.searchBox{max-width:none;height:36px}.bell{width:32px;height:32px}.dashboardGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{padding:11px;gap:8px;border-radius:11px}.cardIcon{width:33px;height:33px;border-radius:9px;font-size:15px}.cardInfo span{font-size:9px}.cardInfo strong{font-size:14px}.dashboardHero{gap:9px}.projectCard{min-height:190px}.projectContent{padding:14px}.projectContent h3{font-size:15px}.projectMiniProgress{width:42%;min-width:130px;margin-top:8px}.projectMainProgressRow{gap:8px}.projectMainProgress{height:7px}.projectProgressPercent{font-size:12px;min-width:34px}.projectMeta{gap:15px}.dashboardProgress{padding:15px;gap:14px}.donut{width:92px;height:92px}.donut:after{width:64px;height:64px}.donut span{font-size:18px}.legend{gap:7px}.legendRow{font-size:9px}.dashboardBottom{gap:9px}.chartBars{gap:8px;padding-left:2px;padding-right:2px}.barCol{min-width:0}.barLabel{font-size:8px;text-align:center}.barValue{font-size:8px;text-align:center}.panel{padding:13px;border-radius:11px}.panelHeader h2{font-size:14px}.panelHeader p{font-size:10px}.formGrid{grid-template-columns:1fr}.field.full{grid-column:auto}.itemCard{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions .status{flex:1}.photoTools{grid-template-columns:1fr}.photoGrid{grid-template-columns:1fr 1fr}.photoCard img{height:115px}.obrasPastas{grid-template-columns:1fr}.obraPastaCapa{height:150px}.obraPastaAcoes{gap:6px}.obraPastaAcoes .primary{min-width:0}header{flex-wrap:wrap;gap:7px;margin-bottom:12px}header h1{font-size:21px}header .primary{width:auto}.modalOverlay{align-items:flex-start;padding:8px}.modal{margin-top:3vh}.modalBody{padding:15px}.equipeGrid{grid-template-columns:1fr}}
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


  /* Ferramentas: somente no celular, transforma cada unidade em um cartão compacto.
     No desktop a tabela continua exatamente como estava. */
  .toolMobileTable{overflow:visible}
  .toolMobileTable table{min-width:0;width:100%;border-collapse:separate;border-spacing:0 8px}
  .toolMobileTable thead{display:none}
  .toolMobileTable tbody{display:block;width:100%}
  .toolMobileTable tr.toolUnitRow{display:flex;flex-direction:column;gap:0;border:1px solid #1b334b;border-radius:11px;background:#0d1b2d;overflow:hidden}
  .toolMobileTable tr.toolUnitRow td{display:flex;align-items:center;width:100%;min-width:0;max-width:none!important;padding:6px 10px;border:0;font-size:9px;line-height:1.2;word-break:break-word}
  .toolMobileTable tr.toolUnitRow td:first-child{padding-top:10px;color:#eef5fb}
  .toolMobileTable .toolNameCell{min-width:0;flex-direction:column;align-items:flex-start;justify-content:flex-start}
  .toolMobileTable .toolNameCell strong{font-size:11px;line-height:1.15}
  .toolMobileTable .toolNameCell .muted{font-size:7.5px;line-height:1.15;margin-top:5px}
  .toolMobileTable tr.toolUnitRow td:nth-child(2)::before{content:"Marca/modelo: ";color:#637b92;font-weight:700;margin-right:3px;flex-shrink:0}
  .toolMobileTable tr.toolUnitRow td:nth-child(3)::before{content:"Unidade: ";color:#637b92;font-weight:700;margin-right:5px;flex-shrink:0}
  .toolMobileTable tr.toolUnitRow td:nth-child(4)::before{content:"Valor: ";color:#637b92;font-weight:700;margin-right:3px;flex-shrink:0}
  .toolMobileTable tr.toolUnitRow td:nth-child(5){display:flex;align-items:center;gap:6px}
  .toolMobileTable tr.toolUnitRow td:nth-child(5)::before{content:"Local: ";color:#637b92;font-weight:700;flex-shrink:0}
  .toolMobileTable .toolUnitTag{padding:3px 6px;font-size:8px;white-space:nowrap}
  .toolMobileTable .toolLocationSelect{flex:1;min-width:0;max-width:none;width:auto;padding:5px 7px;font-size:8px}
  .toolMobileTable tr.toolUnitRow td:last-child{padding:8px 10px 10px;border-top:1px solid #172c41;margin-top:2px}
  .toolMobileTable tr.toolUnitRow td:last-child .actions{width:100%;gap:6px}
  .toolMobileTable tr.toolUnitRow td:last-child button{flex:1;min-width:0;padding:7px 9px;font-size:9px;display:flex;align-items:center;justify-content:center}
  .obraEtapasEditarBar{justify-content:center;margin-top:10px}
  .obraEtapasEditarBar .secondary{width:100%;justify-content:center;text-align:center}
}

@media(max-width:700px){.diasSemanaGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.diaTrabalho{min-height:90px}.resumoDiarias{grid-template-columns:1fr}.resumoDiarias>div{display:flex;justify-content:space-between;align-items:center}.resumoDiarias strong{margin-top:0}}

/* CGL — fundo claro da área principal */
body{background:#ffffff!important;color:#172033!important}
.app{background:#ffffff!important}
.main{background:#ffffff!important}
.content{background:#ffffff!important}
.topbar{background:#ffffff!important;color:#172033!important;border-bottom:1px solid #e2e8f0!important}
header h1{color:#172033!important}
header span{color:#64748b!important}
.searchBox{background:#ffffff!important;border-color:#cbd5e1!important}
.searchBox input{color:#172033!important}
.searchBox input::placeholder{color:#94a3b8!important}
.bell,.logoutBtn{background:#ffffff!important;color:#334155!important;border-color:#cbd5e1!important}
.panel,.itemCard,.card{background:#ffffff!important;color:#172033!important;border-color:#dbe2ea!important;box-shadow:0 8px 24px rgba(15,23,42,.07)!important}
.panelHeader h2,.itemCard h3,.card h3{color:#172033!important}
.panelHeader p,.itemCard p,.card p{color:#64748b!important}
.field input,.field select,.field textarea{background:#ffffff!important;color:#172033!important;border-color:#cbd5e1!important}
.field span{color:#475569!important}
.tableWrap{background:#ffffff!important}
.tableWrap th{color:#64748b!important}
.tableWrap td{color:#334155!important;border-color:#e2e8f0!important}
tr:hover td{background:#f8fafc!important}
.modal{background:#ffffff!important;color:#172033!important;border-color:#dbe2ea!important}
.modalHeader{border-color:#e2e8f0!important}
.modalHeader h2{color:#172033!important}
.secondary,.cancel,.close{background:#f1f5f9!important;color:#334155!important;border-color:#cbd5e1!important}
.secondary:hover,.cancel:hover,.close:hover{background:#e2e8f0!important}
.diaTrabalho{background:#f8fafc!important;color:#172033!important;border-color:#cbd5e1!important}
.diaTrabalho.trabalhou{background:#ecfdf5!important;border-color:#86efac!important;color:#166534!important}
.diaTrabalho.naoTrabalhou{background:#f8fafc!important;color:#64748b!important}
.resumoDiarias{background:#f8fafc!important;border-color:#dbe2ea!important}
.resumoDiarias span{color:#64748b!important}
.resumoDiarias strong{color:#172033!important}

/* =========================================================
   CGL • PALETA FINAL — MODELO 2 DA REFERÊNCIA
   SOMENTE CORES / ACABAMENTO. ESTRUTURA E LAYOUT PRESERVADOS.
   ========================================================= */
:root{
  --bg:#f5f9fd!important;
  --panel:#ffffff!important;
  --panel2:#f8fbff!important;
  --line:#dce7f2!important;
  --muted:#6d7f93!important;
  --text:#172a3d!important;
  --blue:#1597f5!important;
  --cyan:#2bc7f5!important;
  --green:#27c995!important;
  --purple:#8b63e8!important;
  --orange:#f2a24a!important;
  --red:#ef6680!important;
  --shadow:0 10px 28px rgba(23,42,61,.08)!important;
}

html,body,#root{background:#f5f9fd!important;color:#172a3d!important}
body{background:#f5f9fd!important;color:#172a3d!important}
.app,.main,.content{background:#f5f9fd!important;color:#172a3d!important}

/* Barra lateral — branca como na referência */
.sidebar{
  background:#ffffff!important;
  color:#172a3d!important;
  border-right:1px solid #dce7f2!important;
  box-shadow:8px 0 28px rgba(23,42,61,.07)!important;
}
.logo{border-bottom-color:#e2ebf4!important}
.logoMark{
  background:linear-gradient(135deg,#168ff0,#2bc7f5)!important;
  box-shadow:0 5px 18px rgba(21,151,245,.22)!important;
}
.logo h1{color:#17304a!important}
.logo span,.sidebarFooter span{color:#74869a!important}
.nav button{color:#718399!important}
.nav button:hover{background:#f2f8fd!important;color:#17304a!important}
.nav button.active{
  background:#e5f3ff!important;
  border-color:#c9e7fb!important;
  color:#168fe9!important;
  box-shadow:inset 3px 0 0 #1597f5!important;
}
.sidebarFooter{border-top-color:#e2ebf4!important}
.avatar{background:linear-gradient(135deg,#1597f5,#8b63e8)!important}
.sidebarFooter strong{color:#253b51!important}

/* Cabeçalho */
.topbar{background:#f5f9fd!important;border-color:#dce7f2!important}
header h1{color:#172a3d!important}
header span{color:#708399!important}
.searchBox{
  background:#ffffff!important;
  border-color:#dce7f2!important;
  color:#708399!important;
  box-shadow:0 4px 14px rgba(23,42,61,.05)!important;
}
.searchBox input{color:#172a3d!important}
.searchBox input::placeholder{color:#9aabbb!important}
.bell,.logoutBtn{
  background:#ffffff!important;
  color:#4f6479!important;
  border-color:#dce7f2!important;
}
.onlineDot{color:#27b987!important}
.syncText,.userEmail{color:#718398!important}

/* Ações */
.primary,button.primary{
  background:linear-gradient(135deg,#168ff0,#20b6f2)!important;
  color:#ffffff!important;
  border-color:#1597f5!important;
  box-shadow:0 8px 22px rgba(21,151,245,.18)!important;
}
.primary:hover,button.primary:hover{background:linear-gradient(135deg,#0e83df,#18aeea)!important}
.secondary,.cancel,.close,button.secondary{
  background:#f2f7fb!important;
  color:#40566d!important;
  border-color:#d4e1ec!important;
}
.secondary:hover,.cancel:hover,.close:hover,button.secondary:hover{background:#e7f0f7!important;color:#213b54!important}
.danger,button.danger,.btnDanger,.deleteBtn{
  background:#fff0f3!important;
  color:#d84d6b!important;
  border-color:#f7ccd6!important;
}
.danger:hover,button.danger:hover{background:#ffe5eb!important}
.success,button.success,.btnSuccess{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}
.warning,button.warning,.btnWarning{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}
.info,button.info,.btnInfo{background:#f0eaff!important;color:#7452cf!important;border-color:#ddd0fb!important}

/* Cards e painéis — branco, com borda fria e sombra leve */
.card,.panel,.projectCard,.dashboardProgress,.tableWrap,.itemCard,.obraPasta{
  background:#ffffff!important;
  color:#172a3d!important;
  border-color:#dce7f2!important;
  box-shadow:0 8px 24px rgba(23,42,61,.065)!important;
}
.card:hover,.projectCard:hover,.obraPasta:hover{border-color:#c5dceb!important;box-shadow:0 12px 30px rgba(23,42,61,.09)!important}
.card h2,.card h3,.panel h2,.panel h3,.panelHeader h2,.itemCard h3{color:#172a3d!important}
.card p,.panel p,.panelHeader p,.itemCard p,.muted{color:#718399!important}
.cardInfo span{color:#718399!important}
.cardInfo strong{color:#172a3d!important}

/* Indicadores do dashboard — pastel como na imagem */
.dashboardCard:nth-child(1) .cardIcon,.dashboardCard:nth-child(5) .cardIcon{
  background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important;
}
.dashboardCard:nth-child(2) .cardIcon{
  background:#e6faf3!important;color:#18a878!important;border-color:#c6efdf!important;
}
.dashboardCard:nth-child(3) .cardIcon{
  background:#f0eaff!important;color:#805bd8!important;border-color:#ded2fa!important;
}
.dashboardCard:nth-child(4) .cardIcon{
  background:#fff3e5!important;color:#e28d32!important;border-color:#f7dfc1!important;
}
.dashboardCard:nth-child(6) .cardIcon{
  background:#fff0f3!important;color:#df5a78!important;border-color:#f5d0d9!important;
}
.cardIcon{border-radius:11px!important}

/* Obras / imagens */
.obraPastaCapa{border-bottom-color:#dce7f2!important;background:#edf5fa!important}
.obraPastaSemFoto{background:radial-gradient(circle at 50% 35%,#d9edf9,#f5f9fd 72%)!important}
.obraPastaCapaSombra{background:linear-gradient(180deg,rgba(10,29,47,.04) 15%,rgba(10,29,47,.16) 42%,rgba(10,29,47,.78) 100%)!important}
.obraPastaCapaNome strong{color:#ffffff!important}
.obraPastaCapaNome span{color:#5ed0aa!important}
.obraPastaCorpo{background:#ffffff!important}
.pessoaTag{background:#e8f5ff!important;color:#188fdc!important;border-color:#cbe7f8!important}

/* Progresso */
.progress{background:#e8f0f6!important}
.progressBar{background:linear-gradient(90deg,#1597f5,#2bc7f5)!important;box-shadow:0 0 12px rgba(43,199,245,.22)!important}
.progressInfo{color:#178fe7!important}
.etapaResumoHeader{color:#708399!important}
.etapaResumoHeader strong{color:#1597f5!important}
.obraProgress{border-top-color:#e3ecf4!important}

/* Tabelas */
table{color:#344b61!important}
th{color:#718399!important;background:#f7fafd!important}
td{color:#344b61!important;border-color:#e5edf4!important}
tr:hover td{background:#f6faff!important}

/* Formulários */
.field span{color:#40566d!important}
.field span b{color:#e35d78!important}
.field input,.field select,.field textarea{
  background:#ffffff!important;
  color:#172a3d!important;
  border-color:#cbdbe8!important;
}
.field input::placeholder,.field textarea::placeholder{color:#9aabbb!important}
.field input:focus,.field select:focus,.field textarea:focus{
  border-color:#75c7f3!important;
  box-shadow:0 0 0 3px rgba(117,199,243,.18)!important;
}

/* Status */
.status-concluido,.concluido{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}
.status-pendente,.pendente{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}
.status-andamento,.emAndamento{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}
.status{border-color:transparent!important}

/* Chips, ferramentas e resumo */
.toolAction,.actionBtn{background:#f5f9fd!important;color:#496078!important;border-color:#dce7f2!important}
.toolAction:hover,.actionBtn:hover{background:#eaf3f9!important}
.resumoDiarias{background:#f7fafd!important;border-color:#dce7f2!important}
.resumoDiarias span{color:#718399!important}
.resumoDiarias strong{color:#172a3d!important}
.diaTrabalho{background:#f7fafd!important;color:#253b51!important;border-color:#cbdbe8!important}
.diaTrabalho.trabalhou{background:#e6faf3!important;border-color:#aee7d4!important;color:#147d5e!important}
.diaTrabalho.naoTrabalhou{background:#f7fafd!important;color:#718399!important}

/* CGL — dias da semana: verde = trabalhou / vermelho = não trabalhou */
.diaTrabalho.trabalhou{
  background:#e6faf3!important;
  border-color:#9edfc8!important;
  color:#147d5e!important;
}
.diaTrabalho.trabalhou strong,
.diaTrabalho.trabalhou b{color:#147d5e!important}
.diaTrabalho.naoTrabalhou{
  background:#fff0f2!important;
  border-color:#f2a7b5!important;
  color:#c9435e!important;
}
.diaTrabalho.naoTrabalhou strong,
.diaTrabalho.naoTrabalhou b{color:#c9435e!important}

/* CGL — Registro de pagamentos em formato de pastinha */
.arquivoPasta{
  width:100%;
  display:flex;
  align-items:center;
  gap:14px;
  padding:16px 18px;
  border:1px solid #dce7f2!important;
  border-radius:14px;
  background:#fff!important;
  color:#243b53!important;
  cursor:pointer;
  text-align:left;
  box-shadow:0 6px 18px rgba(36,59,83,.06);
  transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
}
.arquivoPasta:hover{
  transform:translateY(-1px);
  box-shadow:0 10px 24px rgba(36,59,83,.09);
  border-color:#b9d7ea!important;
}
.arquivoPasta.aberta{
  border-bottom-left-radius:8px;
  border-bottom-right-radius:8px;
  border-color:#b9d7ea!important;
}
.pastaIcon{
  width:48px;
  height:42px;
  display:grid;
  place-items:center;
  border-radius:11px;
  background:#fff4cf;
  font-size:27px;
  flex:none;
}
.pastaTexto{
  display:flex;
  flex-direction:column;
  gap:3px;
  min-width:0;
  flex:1;
}
.pastaTexto strong{font-size:16px;color:#243b53!important}
.pastaTexto small{font-size:12px;color:#718399!important}
.pastaSeta{
  font-size:22px;
  color:#1597f5!important;
  line-height:1;
}
.arquivoPastaConteudo{
  margin-top:-1px;
  padding:18px;
  border:1px solid #b9d7ea!important;
  border-top:0!important;
  border-radius:0 0 14px 14px;
  background:#f8fbff!important;
}
.arquivoCabecalho{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:14px;
}
.arquivoCabecalho>div:first-child{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.arquivoCabecalho span{
  color:#718399!important;
  font-size:12px;
}
@media(max-width:700px){
  .arquivoPasta{padding:14px}
  .pastaIcon{width:44px;height:40px;font-size:24px}
  .arquivoPastaConteudo{padding:13px}
  .arquivoCabecalho{align-items:flex-start}
}

/* Modal */
.modalOverlay{background:rgba(13,31,48,.42)!important}
.modal{background:#ffffff!important;color:#172a3d!important;border-color:#dce7f2!important;box-shadow:0 24px 65px rgba(23,42,61,.18)!important}
.modalHeader{border-color:#e3ecf4!important}
.modalHeader h2{color:#172a3d!important}
.modalHeader span{color:#718399!important}

/* Login — mesma linguagem visual do restante do app */
.authScreen{
  background:
    radial-gradient(circle at 50% 0%,rgba(43,199,245,.15),transparent 34%),
    #f5f9fd!important;
  color:#172a3d!important;
}
.authCard{background:#ffffff!important;color:#172a3d!important;border-color:#dce7f2!important;box-shadow:0 22px 65px rgba(23,42,61,.12)!important}
.authCard h1{color:#172a3d!important}
.authSubtitle,.authHint{color:#718399!important}
.authError{background:#fff0f3!important;color:#d84d6b!important;border-color:#f7ccd6!important}
.authSpinner{border-color:#dce7f2!important;border-top-color:#1597f5!important}
.authButton,.authCard .primary{background:linear-gradient(135deg,#168ff0,#20b6f2)!important;color:#ffffff!important;border-color:#1597f5!important}
.authCard .field input{background:#ffffff!important;color:#172a3d!important;border-color:#cbdbe8!important}
.authCard .field span{color:#40566d!important}
.authBadge{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}

/* Gráficos / legendas */
.legendRow{color:#5f7489!important}
.legendRow b{color:#344b61!important}
.dot.blue{background:#1597f5!important}
.dot.green{background:#27c995!important}
.dot.orange{background:#f2a24a!important}
.bar{background:linear-gradient(180deg,#2bc7f5,#1597f5)!important}

/* Pequenas áreas de erro técnico */
[style*="#091522"]{background:#fff0f3!important}
[style*="#243b52"]{border-color:#f3c8d2!important}
[style*="#ff9eb0"]{color:#d84d6b!important}

[style*="#091522"],[style*="#0c1929"],[style*="#0d1b2d"],[style*="#0b1a2b"],[style*="#07111f"],[style*="#132338"],[style*="#102237"]{background:#ffffff!important;color:#243b53!important}
[style*="#243b52"]{border-color:#dce7f2!important}
[style*="#ff9eb0"]{color:#d85c78!important}

:root{--bg:#f4f8fc!important;--panel:#ffffff!important;--panel2:#f8fbff!important;--line:#dce7f2!important;--muted:#718399!important;--text:#243b53!important;--blue:#1597f5!important;--cyan:#2bc7f5!important;--green:#27c995!important;--purple:#8b63e8!important;--orange:#f2a24a!important;--red:#ef6680!important;--shadow:0 8px 24px rgba(36,59,83,.07)!important}
html,body,#root,.app,.main,.content{background:#f4f8fc!important;color:#243b53!important}
.sidebar{background:#ffffff!important;color:#243b53!important;border-right-color:#dce7f2!important;box-shadow:8px 0 28px rgba(36,59,83,.07)!important}.logo{border-bottom-color:#e2ebf4!important}.logo h1{color:#17304a!important}.logo span,.sidebarFooter span{color:#7b8da0!important}.logoMark{background:linear-gradient(135deg,#1597f5,#2bc7f5)!important;box-shadow:0 5px 18px rgba(21,151,245,.20)!important}.nav button{color:#718399!important}.nav button:hover{background:#f2f8fd!important;color:#17304a!important}.nav button.active{background:#e5f3ff!important;border-color:#c9e7fb!important;color:#168fe9!important;box-shadow:inset 3px 0 0 #1597f5!important}.sidebarFooter{border-top-color:#e2ebf4!important}.sidebarFooter strong{color:#253b51!important}.avatar{background:linear-gradient(135deg,#1597f5,#8b63e8)!important}
.topbar{background:#f4f8fc!important;border-color:#dce7f2!important}header h1{color:#243b53!important}header span{color:#718399!important}.searchBox{background:#ffffff!important;color:#718399!important;border-color:#dce7f2!important;box-shadow:0 4px 14px rgba(36,59,83,.05)!important}.searchBox input{background:transparent!important;color:#243b53!important}.searchBox input::placeholder{color:#9aabbb!important}.bell,.logoutBtn{background:#ffffff!important;color:#4f6479!important;border-color:#dce7f2!important}.onlineDot{color:#27b987!important}.syncText,.userEmail{color:#718398!important}
.primary,button.primary,.authButton{background:linear-gradient(135deg,#168ff0,#20b6f2)!important;color:#ffffff!important;border-color:#1597f5!important;box-shadow:0 8px 22px rgba(21,151,245,.18)!important}.primary:hover,button.primary:hover{background:linear-gradient(135deg,#0e83df,#18aeea)!important}.secondary,.cancel,.close,button.secondary{background:#f2f7fb!important;color:#40566d!important;border-color:#d4e1ec!important}.secondary:hover,.cancel:hover,.close:hover,button.secondary:hover{background:#e7f0f7!important;color:#213b54!important}.danger,button.danger,.btnDanger,.deleteBtn{background:#fff0f3!important;color:#d85c78!important;border-color:#f7ccd6!important}.success,button.success,.btnSuccess{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}.warning,button.warning,.btnWarning{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}.info,button.info,.btnInfo{background:#f0eaff!important;color:#7452cf!important;border-color:#ddd0fb!important}
.card,.panel,.projectCard,.dashboardProgress,.tableWrap,.itemCard,.obraPasta,.mobileFriendlyTable tr,.toolMobileTable tr{background:#ffffff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 8px 24px rgba(36,59,83,.065)!important}.card h2,.card h3,.panel h2,.panel h3,.panelHeader h2,.itemCard h3{color:#243b53!important}.card p,.panel p,.panelHeader p,.itemCard p,.muted{color:#718399!important}.cardInfo span{color:#718399!important}.cardInfo strong{color:#243b53!important}.mobileFriendlyTable td,.toolMobileTable td{color:#344b61!important;border-color:#e5edf4!important}.mobileFriendlyTable td:first-child,.toolMobileTable td:first-child{color:#243b53!important}
.dashboardCard:nth-child(1) .cardIcon,.dashboardCard:nth-child(5) .cardIcon{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}.dashboardCard:nth-child(2) .cardIcon{background:#e6faf3!important;color:#18a878!important;border-color:#c6efdf!important}.dashboardCard:nth-child(3) .cardIcon{background:#f0eaff!important;color:#805bd8!important;border-color:#ded2fa!important}.dashboardCard:nth-child(4) .cardIcon{background:#fff3e5!important;color:#e28d32!important;border-color:#f7dfc1!important}.dashboardCard:nth-child(6) .cardIcon{background:#fff0f3!important;color:#df5a78!important;border-color:#f5d0d9!important}
.obraPastaCapa{border-bottom-color:#dce7f2!important;background:#edf5fa!important}.obraPastaSemFoto{background:radial-gradient(circle at 50% 35%,#d9edf9,#f5f9fd 72%)!important}.obraPastaCapaSombra{background:linear-gradient(180deg,rgba(10,29,47,.04) 15%,rgba(10,29,47,.16) 42%,rgba(10,29,47,.78) 100%)!important}.obraPastaCapaNome strong{color:#ffffff!important}.obraPastaCapaNome span{color:#5ed0aa!important}.obraPastaCorpo{background:#ffffff!important}.pessoaTag{background:#e8f5ff!important;color:#188fdc!important;border-color:#cbe7f8!important}
.progress,.progressTrack{background:#e8f0f6!important}.progressBar{background:linear-gradient(90deg,#1597f5,#2bc7f5)!important;box-shadow:0 0 12px rgba(43,199,245,.22)!important}.progressInfo{color:#178fe7!important}.etapaResumoHeader{color:#708399!important}.etapaResumoHeader strong{color:#1597f5!important}.obraProgress{border-top-color:#e3ecf4!important}.legendRow{color:#5f7489!important}.legendRow b{color:#344b61!important}.dot.blue{background:#1597f5!important}.dot.green{background:#27c995!important}.dot.orange{background:#f2a24a!important}.bar{background:linear-gradient(180deg,#2bc7f5,#1597f5)!important}
.status-concluido,.concluido{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}.status-pendente,.pendente{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}.status-andamento,.emAndamento{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}.status{border-color:transparent!important}
.field span{color:#40566d!important}.field span b{color:#e35d78!important}.field input,.field select,.field textarea{background:#ffffff!important;color:#243b53!important;border-color:#cbdbe8!important}.field input::placeholder,.field textarea::placeholder{color:#9aabbb!important}.field input:focus,.field select:focus,.field textarea:focus{border-color:#75c7f3!important;box-shadow:0 0 0 3px rgba(117,199,243,.18)!important}
.modalOverlay{background:rgba(13,31,48,.42)!important}.modal{background:#ffffff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 24px 65px rgba(36,59,83,.18)!important}.modalHeader{border-color:#e3ecf4!important}.modalHeader h2{color:#243b53!important}.modalHeader span{color:#718399!important}
.authScreen{background:radial-gradient(circle at 50% 0%,rgba(43,199,245,.15),transparent 34%),#f4f8fc!important;color:#243b53!important}.authCard{background:#ffffff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 22px 65px rgba(36,59,83,.12)!important}.authCard h1{color:#243b53!important}.authSubtitle,.authHint{color:#718399!important}.authError{background:#fff0f3!important;color:#d84d6b!important;border-color:#f7ccd6!important}.authSpinner{border-color:#dce7f2!important;border-top-color:#1597f5!important}.authCard .field input{background:#ffffff!important;color:#243b53!important;border-color:#cbdbe8!important}.authCard .field span{color:#40566d!important}.authBadge{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}
.toolAction,.actionBtn{background:#f5f9fd!important;color:#496078!important;border-color:#dce7f2!important}.toolAction:hover,.actionBtn:hover{background:#eaf3f9!important}.resumoDiarias{background:transparent!important;border-color:transparent!important}
.resumoDiarias>div{background:#fff!important;color:#243b53!important;border:1px solid #dce7f2!important;box-shadow:0 5px 16px rgba(31,75,110,.06)!important}
.resumoDiarias span{color:#718399!important}.resumoDiarias strong{color:#243b53!important}
.resumoDiarias>div:last-child strong{color:#1597b5!important}.diaTrabalho{background:#f7fafd!important;color:#253b51!important;border-color:#cbdbe8!important}.diaTrabalho.trabalhou{background:#e6faf3!important;border-color:#aee7d4!important;color:#147d5e!important}.diaTrabalho.naoTrabalhou{background:#f7fafd!important;color:#718399!important}


/* =========================================================
   CGL • PALETA DEFINITIVA — MODELO 2 CLARO
   Regra: somente cores/acabamento. Layout e dimensões preservados.
   ========================================================= */
:root{
  --bg:#f4f8fc!important;
  --panel:#ffffff!important;
  --panel2:#f8fbff!important;
  --line:#dce7f2!important;
  --muted:#718399!important;
  --text:#243b53!important;
  --blue:#1597f5!important;
  --cyan:#2bc7f5!important;
  --green:#27c995!important;
  --purple:#8b63e8!important;
  --orange:#f2a24a!important;
  --red:#ef6680!important;
  --shadow:0 8px 24px rgba(36,59,83,.07)!important;
}
html,body,#root,.app,.main,.content{background:#f4f8fc!important;color:#243b53!important}
.sidebar{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:8px 0 28px rgba(36,59,83,.07)!important}
.logo{border-bottom-color:#e2ebf4!important}.logo h1{color:#17304a!important}.logo span,.sidebarFooter span{color:#7b8da0!important}
.logoMark{background:linear-gradient(135deg,#1597f5,#2bc7f5)!important;box-shadow:0 5px 18px rgba(21,151,245,.2)!important}
.nav button{background:transparent!important;color:#718399!important}.nav button:hover{background:#f2f8fd!important;color:#17304a!important}.nav button.active{background:#e5f3ff!important;border-color:#c9e7fb!important;color:#168fe9!important;box-shadow:inset 3px 0 0 #1597f5!important}.sidebarFooter{border-top-color:#e2ebf4!important}.sidebarFooter strong{color:#253b51!important}.avatar{background:linear-gradient(135deg,#1597f5,#8b63e8)!important}
.topbar{background:#f4f8fc!important;border-color:#dce7f2!important}.searchBox{background:#fff!important;color:#718399!important;border-color:#dce7f2!important}.searchBox input{background:transparent!important;color:#243b53!important}.searchBox input::placeholder{color:#9aabbb!important}.bell,.logoutBtn{background:#fff!important;color:#4f6479!important;border-color:#dce7f2!important}.onlineDot{color:#27b987!important}.syncText,.userEmail{color:#718398!important}
header h1{color:#243b53!important}header span{color:#718399!important}
.primary,button.primary,.authButton{background:linear-gradient(135deg,#168ff0,#20b6f2)!important;color:#fff!important;border-color:#1597f5!important;box-shadow:0 8px 22px rgba(21,151,245,.18)!important}.primary:hover,button.primary:hover{background:linear-gradient(135deg,#0e83df,#18aeea)!important}
.secondary,.cancel,.close,button.secondary{background:#f2f7fb!important;color:#40566d!important;border-color:#d4e1ec!important}.secondary:hover,.cancel:hover,.close:hover,button.secondary:hover{background:#e7f0f7!important;color:#213b54!important}
.danger,button.danger,.btnDanger,.deleteBtn{background:#fff0f3!important;color:#d85c78!important;border-color:#f7ccd6!important}.danger:hover,button.danger:hover{background:#ffe5eb!important}
.success,button.success,.btnSuccess{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}.warning,button.warning,.btnWarning{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}.info,button.info,.btnInfo{background:#f0eaff!important;color:#7452cf!important;border-color:#ddd0fb!important}
.card,.panel,.projectCard,.dashboardProgress,.tableWrap,.itemCard,.obraPasta{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 8px 24px rgba(36,59,83,.065)!important}
.card h2,.card h3,.panel h2,.panel h3,.panelHeader h2,.itemCard h3{color:#243b53!important}.card p,.panel p,.panelHeader p,.itemCard p,.muted{color:#718399!important}.cardInfo span{color:#718399!important}.cardInfo strong{color:#243b53!important}
.dashboardCard:nth-child(1) .cardIcon,.dashboardCard:nth-child(5) .cardIcon{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}.dashboardCard:nth-child(2) .cardIcon{background:#e6faf3!important;color:#18a878!important;border-color:#c6efdf!important}.dashboardCard:nth-child(3) .cardIcon{background:#f0eaff!important;color:#805bd8!important;border-color:#ded2fa!important}.dashboardCard:nth-child(4) .cardIcon{background:#fff3e5!important;color:#e28d32!important;border-color:#f7dfc1!important}.dashboardCard:nth-child(6) .cardIcon{background:#fff0f3!important;color:#df5a78!important;border-color:#f5d0d9!important}
.projectCard{background:#fff!important}.projectShade{background:linear-gradient(90deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.78) 42%,rgba(255,255,255,.18) 100%)!important}.projectContent h3{color:#243b53!important}.projectContent p{color:#718399!important}.projectMeta span{color:#718399!important}.projectMeta strong{color:#ffffff!important;text-shadow:0 1px 3px rgba(12,31,48,.75)!important}.projectProgressPercent{color:#243b53!important}.projectMiniProgress,.projectMainProgress{background:#e8f0f6!important}.projectMiniProgressBar,.projectMainProgressBar{background:linear-gradient(90deg,#2bc7f5,#1597f5)!important;box-shadow:0 0 10px rgba(43,199,245,.22)!important}.projectStatus{background:#e6faf3!important;border-color:#bdeedc!important;color:#14986e!important}
.dashboardProgress{background:#fff!important}.donut{background:conic-gradient(#1597f5 calc(var(--p)*1%),#e8f0f6 0)!important;box-shadow:0 0 24px rgba(21,151,245,.10)!important}.donut:after{background:#fff!important}.donut span{color:#243b53!important}.legendRow{color:#5f7489!important}.legendRow b{color:#344b61!important}.dot.blue{background:#1597f5!important}.dot.green{background:#27c995!important}.dot.orange{background:#f2a24a!important}.bar{background:linear-gradient(180deg,#2bc7f5,#1597f5)!important}
.obraPastaCapa{border-bottom-color:#dce7f2!important;background:#edf5fa!important}.obraPastaSemFoto{background:radial-gradient(circle at 50% 35%,#d9edf9,#f5f9fd 72%)!important}.obraPastaCapaSombra{background:linear-gradient(180deg,rgba(10,29,47,.02) 15%,rgba(10,29,47,.10) 42%,rgba(10,29,47,.68) 100%)!important}.obraPastaCapaNome strong{color:#fff!important}.obraPastaCapaNome span{color:#5ed0aa!important}.obraPastaCorpo{background:#fff!important}.pessoaTag{background:#e8f5ff!important;color:#188fdc!important;border-color:#cbe7f8!important}
.progress,.progressTrack{background:#e8f0f6!important}.progressBar{background:linear-gradient(90deg,#1597f5,#2bc7f5)!important;box-shadow:0 0 12px rgba(43,199,245,.22)!important}.progressInfo{color:#178fe7!important}.etapaResumoHeader{color:#708399!important}.etapaResumoHeader strong,.obraProgressHeader strong,.progressDashboardInfo strong{color:#1597f5!important}.obraProgress,.tarefaProgresso{border-top-color:#e3ecf4!important}.obraProgressHeader,.progressDashboardInfo,.tarefaProgressoHeader{color:#708399!important}
.tarefaControles button,.etapaControls button{background:#f2f7fb!important;color:#40566d!important;border-color:#d4e1ec!important}.tarefaControles input,.etapaControls input{background:#fff!important;color:#243b53!important;border-color:#cbdbe8!important}.tarefaControles input:focus,.etapaControls input:focus{border-color:#75c7f3!important;box-shadow:0 0 0 3px rgba(117,199,243,.18)!important}.sectionTitle{color:#243b53!important}.etapa,.funcionarioBox{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important}.etapaPercentual{color:#1597f5!important}.funcionarioInfo{color:#718399!important}.funcionarioBox input{accent-color:#1597f5!important}
.status{background:#f2f7fb!important;color:#40566d!important}.status-concluido,.concluido{background:#e6faf3!important;color:#14986e!important;border-color:#bdeedc!important}.status-pendente,.pendente{background:#fff5e8!important;color:#c8781e!important;border-color:#f6d8ad!important}.status-andamento,.status-em-andamento,.emAndamento{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}
table{color:#344b61!important}th{color:#718399!important;background:#f7fafd!important}td{color:#344b61!important;border-color:#e5edf4!important}tr:hover td{background:#f6faff!important}
.mobileFriendlyTable tr,.toolMobileTable tr,.mobileFriendlyTable tbody tr,.toolMobileTable tbody tr{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 8px 24px rgba(36,59,83,.065)!important}.mobileFriendlyTable td,.toolMobileTable td{color:#344b61!important;border-color:#e5edf4!important}.mobileFriendlyTable td:first-child,.toolMobileTable td:first-child{color:#243b53!important}.mobileFriendlyTable td:last-child,.toolMobileTable tr.toolUnitRow td:last-child{border-top-color:#e5edf4!important}
.toolAction,.actionBtn{background:#f5f9fd!important;color:#496078!important;border-color:#dce7f2!important}.toolAction:hover,.actionBtn:hover{background:#eaf3f9!important}.toolSummary{background:#f7fafd!important;color:#5f7489!important;border-color:#dce7f2!important}.toolUnitTag{background:#e8f5ff!important;color:#188fdc!important;border-color:#cbe7f8!important}.toolLocationSelect{background:#fff!important;color:#344b61!important;border-color:#cbdbe8!important}
.resumoDiarias{background:#f7fafd!important;border-color:#dce7f2!important}.resumoDiarias span{color:#718399!important}.resumoDiarias strong{color:#243b53!important}.diaTrabalho{background:#f7fafd!important;color:#253b51!important;border-color:#cbdbe8!important}.diaTrabalho.trabalhou{background:#e6faf3!important;border-color:#aee7d4!important;color:#147d5e!important}.diaTrabalho.naoTrabalhou{background:#f7fafd!important;color:#718399!important}
.photoTools input[type=file],.photoCard,.photoEmpty{background:#fff!important;color:#5f7489!important;border-color:#cbdbe8!important}.photoCard small{color:#718399!important}.photoViewer img{background:#f7fafd!important;border-color:#dce7f2!important}.photoViewerInfo{color:#718399!important}.photoViewerInfo strong{color:#243b53!important}
.field span{color:#40566d!important}.field span b{color:#e35d78!important}.field input,.field select,.field textarea{background:#fff!important;color:#243b53!important;border-color:#cbdbe8!important}.field input::placeholder,.field textarea::placeholder{color:#9aabbb!important}.field input:focus,.field select:focus,.field textarea:focus{border-color:#75c7f3!important;box-shadow:0 0 0 3px rgba(117,199,243,.18)!important}
.modalOverlay{background:rgba(20,42,62,.28)!important}.modal{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 24px 65px rgba(36,59,83,.18)!important}.modalHeader{border-color:#e3ecf4!important}.modalHeader h2{color:#243b53!important}.modalHeader span{color:#718399!important}
.authScreen{background:radial-gradient(circle at 50% 0%,rgba(43,199,245,.15),transparent 34%),#f4f8fc!important;color:#243b53!important}.authCard{background:#fff!important;color:#243b53!important;border-color:#dce7f2!important;box-shadow:0 22px 65px rgba(36,59,83,.12)!important}.authCard h1{color:#243b53!important}.authSubtitle,.authHint{color:#718399!important}.authError{background:#fff0f3!important;color:#d84d6b!important;border-color:#f7ccd6!important}.authSpinner{border-color:#dce7f2!important;border-top-color:#1597f5!important}.authCard .field input{background:#fff!important;color:#243b53!important;border-color:#cbdbe8!important}.authCard .field span{color:#40566d!important}.authBadge{background:#e8f4ff!important;color:#178fe7!important;border-color:#cfe9fb!important}
/* Remove os últimos blocos azul-marinho que apareciam em registros/erros. */
[style*="#091522"],[style*="#0c1929"],[style*="#0d1b2d"],[style*="#0b1a2b"],[style*="#07111f"],[style*="#132338"],[style*="#102237"]{background:#fff!important;color:#243b53!important}
[style*="#243b52"]{border-color:#dce7f2!important}[style*="#ff9eb0"]{color:#d85c78!important}


/* CGL — correção final das 2 áreas restantes do Dashboard.
   Somente cores/contraste; layout e lógica preservados. */

/* 1) Card da obra em destaque: texto e progresso precisam ter contraste sobre a foto. */
.projectCard{background:#ffffff!important;border-color:#dce7f2!important}
.projectImage{opacity:.96!important;filter:saturate(1.12) brightness(.98) contrast(1.04)!important}
.projectShade{
  background:linear-gradient(90deg,rgba(25,70,96,.34) 0%,rgba(25,70,96,.12) 45%,rgba(255,255,255,.02) 100%)!important;
}
.projectContent h3{color:#ffffff!important;text-shadow:0 2px 4px rgba(12,31,48,.75)!important}
.projectContent p{color:#ffffff!important;text-shadow:0 1px 3px rgba(12,31,48,.65)!important}
.projectMeta span{color:#ffffff!important;text-shadow:0 1px 3px rgba(12,31,48,.65)!important}
.projectMeta strong{color:#ffffff!important;text-shadow:0 2px 4px rgba(12,31,48,.78)!important;font-weight:800!important}
.projectProgressPercent{color:#ffffff!important;text-shadow:0 2px 4px rgba(12,31,48,.75)!important}
.projectMiniProgress,.projectMainProgress{background:rgba(232,240,246,.86)!important}
.projectMiniProgressBar,.projectMainProgressBar{
  background:linear-gradient(90deg,#2bc7f5,#1597f5)!important;
  box-shadow:0 0 10px rgba(43,199,245,.20)!important;
}
.projectStatus{
  background:#e6faf3!important;
  border-color:#bdeedc!important;
  color:#14986e!important;
}

/* 2) Últimas atividades: títulos não podem ficar quase brancos sobre fundo branco. */
.activity{border-bottom-color:#e3ecf4!important}
.activityIcon{
  background:#e8f4ff!important;
  color:#1597f5!important;
  border:1px solid #cfe9fb!important;
}
.activity strong{
  color:#243b53!important;
  font-weight:800!important;
}
.activity span{
  color:#718399!important;
}
.activity:last-child{border-bottom-color:transparent!important}


/* Correção final — resumo de diárias no modal de gerenciamento.
   Remove os últimos cartões azul-marinho que ainda escapavam da paleta clara. */
.resumoDiarias{background:transparent!important}
.resumoDiarias>div{
  background:#ffffff!important;
  border:1px solid #dce7f2!important;
  box-shadow:0 5px 16px rgba(31,75,110,.06)!important;
}
.resumoDiarias span{color:#718399!important}
.resumoDiarias strong{color:#243b53!important}
.resumoDiarias>div:last-child strong{color:#1597b5!important}

.pixCopyButton{
  margin-top:6px!important;
  background:#eef9ff!important;
  color:#147fa8!important;
  border-color:#bfe3f3!important;
  font-weight:800!important;
}
.pixCopyButton:hover{background:#e1f5ff!important}


.inputLike{
  min-height:42px;
  display:flex;
  align-items:center;
  width:100%;
  box-sizing:border-box;
  padding:10px 12px;
  border:1px solid #dce7f2;
  border-radius:12px;
  background:#f6f9fc;
  color:#344b61;
  font-weight:800;
}
.projectMeta{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px!important}
@media(max-width:760px){
  .projectMeta{
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    gap:6px!important;
    width:100%;
  }
  .projectMeta > div{
    min-width:0;
    text-align:center;
  }
  .projectMeta span{
    font-size:8px!important;
    letter-spacing:.25px!important;
    white-space:nowrap;
  }
  .projectMeta strong{
    font-size:10px!important;
    line-height:1.2!important;
    white-space:nowrap;
  }
}

.pagamentoHistoricoPanel{margin-top:14px!important}.registroPagamentoBadge{padding:7px 11px;border-radius:999px;background:#e8f4ff;color:#168fe9;border:1px solid #cfe9fb;font-size:10px;font-weight:800}.registroPagamentosGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.registroPagamentoCard{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #dce7f2;border-radius:12px;background:#fff;box-shadow:0 6px 18px rgba(36,59,83,.055)}.registroPagamentoIcon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#e6faf3;color:#14986e;border:1px solid #bdeedc;font-weight:900;flex-shrink:0}.registroPagamentoInfo{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.registroPagamentoInfo strong{font-size:13px;color:#243b53}.registroPagamentoInfo span{font-size:10px;color:#718399}.registroPagamentoInfo small{font-size:9px;color:#9aabbb}.registroPagamentoValor{font-size:14px;color:#14986e;white-space:nowrap}.registroPagamentoAcoes{display:flex;flex-direction:column;align-items:stretch;gap:7px;min-width:180px}
.registroPagamentoAcoes .registroPagamentoValor{text-align:right;display:block;margin-bottom:1px}
.registroVoltarBtn,.registroApagarBtn{width:100%!important;min-height:38px!important;padding:8px 10px!important;border-radius:10px!important;font-size:11px!important;font-weight:800!important;white-space:normal!important}
.registroVoltarBtn{border:1px solid #cfe2f1!important;background:#f5faff!important;color:#168fe9!important}
.registroApagarBtn{border:1px solid #f1c2ca!important;background:#fff5f6!important;color:#c9435e!important}
.registroVoltarBtn:hover,.registroApagarBtn:hover{transform:translateY(-1px)}
.registroPagamentoEmpty{padding:34px 15px;text-align:center;color:#718399;display:flex;flex-direction:column;gap:6px}.registroPagamentoEmpty span{font-size:10px;color:#9aabbb}@media(max-width:650px){
  .registroPagamentosGrid{grid-template-columns:1fr}
  .registroPagamentoCard{align-items:flex-start;flex-wrap:wrap}
  .registroPagamentoInfo{min-width:calc(100% - 52px)}
  .registroPagamentoAcoes{width:100%;min-width:0;margin-left:50px}
  .registroPagamentoAcoes .registroPagamentoValor{text-align:left}
}


.diarioPanel{overflow:hidden}
.diarioHeader{align-items:center}
.diarioResumo{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:76px;padding:9px 12px;border:1px solid #cfe2f1;border-radius:12px;background:#f5faff}
.diarioResumo strong{font-size:20px;color:#168fe9;line-height:1}
.diarioResumo span{font-size:9px;color:#718399;margin-top:4px}
.diarioLista{display:flex;flex-direction:column;gap:14px}
.diarioCard{border:1px solid #dce7f2;border-radius:15px;background:#fff;box-shadow:0 7px 22px rgba(36,59,83,.06);padding:16px}
.diarioCardTop{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.diarioData{font-size:10px;color:#168fe9;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
.diarioCard h3{margin:5px 0 7px;font-size:17px;color:#243b53}
.diarioObraTag{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#eef8ff;border:1px solid #d3ebfb;color:#1687c8;font-size:10px;font-weight:800}
.diarioAcoes{display:flex;gap:7px;flex-shrink:0}
.diarioAcoes button{min-height:36px;padding:7px 10px;font-size:10px}
.diarioEtapa{margin-top:13px;padding:8px 10px;border-radius:9px;background:#f7fafc;color:#536b82;font-size:11px}
.diarioDescricao,.diarioObservacao{margin-top:12px}
.diarioDescricao strong,.diarioObservacao strong{font-size:11px;color:#344b61}
.diarioDescricao p,.diarioObservacao p{margin:5px 0 0;color:#536b82;font-size:12px;line-height:1.55;white-space:pre-wrap}
.diarioObservacao{padding:10px 11px;border-left:3px solid #8bc6eb;background:#f8fbfe;border-radius:7px}
.diarioFotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:10px;margin-top:14px}
.diarioFotoCard{overflow:hidden;border:1px solid #dce7f2;border-radius:11px;background:#f7fafc}
.diarioFotoCard img{display:block;width:100%;height:150px;object-fit:cover}
.diarioFotoLegenda{padding:7px 8px;font-size:9px;color:#536b82;line-height:1.35}
.diarioEmpty{padding:55px 20px;text-align:center;border:1px dashed #cfe0ed;border-radius:14px;background:#f9fcff;display:flex;flex-direction:column;align-items:center;gap:7px;color:#718399}
.diarioEmptyIcon{font-size:38px;margin-bottom:4px}
.diarioEmpty strong{font-size:14px;color:#344b61}
.diarioEmpty span{font-size:10px}
.diarioFotoEditor{padding:13px;border:1px solid #dce7f2;border-radius:12px;background:#f9fcff}
.diarioFotoEditorHeader{display:flex;justify-content:space-between;align-items:center;gap:10px}
.diarioFotoEditorHeader>div:first-child{display:flex;flex-direction:column;gap:3px}
.diarioFotoEditorHeader strong{font-size:12px;color:#344b61}
.diarioFotoEditorHeader span{font-size:9px;color:#8a9bad}
.diarioFotoListaEditor{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:11px}
.diarioFotoEditorCard{overflow:hidden;border:1px solid #dce7f2;border-radius:10px;background:#fff}
.diarioFotoEditorCard img{width:100%;height:125px;display:block;object-fit:cover}
.diarioFotoEditorCard button{width:100%;border:0!important;border-radius:0!important;min-height:32px!important;font-size:9px!important}
.diarioFotoAviso{margin-top:10px;padding:10px;border-radius:9px;background:#fff;color:#8a9bad;font-size:10px;text-align:center}
@media(max-width:650px){
  .diarioCard{padding:13px}
  .diarioCardTop{flex-direction:column}
  .diarioAcoes{width:100%}
  .diarioAcoes button{flex:1}
  .diarioFotos{grid-template-columns:repeat(2,minmax(0,1fr))}
  .diarioFotoCard img{height:125px}
  .diarioFotoEditorHeader{flex-direction:column;align-items:stretch}
  .diarioFotoEditorHeader .photoActions{width:100%}
  .diarioFotoEditorHeader .photoActions button{flex:1}
  .diarioResumo{min-width:60px}
}

/* Diário de Obra — Layout 1: clean, simples e direto. */
.diarioHeaderAcoes{display:flex;align-items:center;gap:10px}
.pdfAcoes{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.pdfBtn,.pdfShareBtn{min-height:36px;padding:8px 12px;font-size:10px}
.pdfBtn{font-weight:800}
.diarioPanel .panelHeader{border-bottom:1px solid #e6edf4;padding-bottom:12px;margin-bottom:14px}
.diarioPanel .diarioCard{border:1px solid #d9e4ee;border-radius:13px;background:#fff;box-shadow:0 5px 18px rgba(15,23,42,.055)}
.diarioPanel .diarioCardTop{padding-bottom:9px;border-bottom:1px solid #eef2f6}
.diarioPanel .diarioData{color:#147fe8}
.diarioPanel .diarioCard h3{font-size:16px;margin-top:4px}
.diarioPanel .diarioDescricao strong,.diarioPanel .diarioObservacao strong{font-size:10px;text-transform:uppercase;letter-spacing:.25px}
.diarioPanel .diarioFotoCard{border-radius:9px}
.diarioPanel .diarioFotoCard img{height:145px}
@media(max-width:650px){
  .diarioHeaderAcoes{width:100%;justify-content:space-between;align-items:center}
  .diarioHeaderAcoes .pdfAcoes{flex:1;justify-content:flex-end}
  .diarioHeaderAcoes .pdfAcoes button{min-height:34px}
  .pdfAcoes{gap:5px}
  .pdfBtn,.pdfShareBtn{padding:7px 9px;font-size:9px}
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
    Ferramentas:"M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L14 12l-2-2 2.7-2.7Z",
     "Diário de Obra":"M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h8M8 11h8M8 15h5"
  };
  return <span className="navIcon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[nome] || paths.Dashboard}/></svg></span>;
}

function comTempoLimite<T>(promessa: Promise<T>, milissegundos = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = window.setTimeout(() => {
      reject(new Error("A conexão com o servidor demorou demais. Verifique sua internet e tente novamente."));
    }, milissegundos);

    promessa.then(
      (valor) => {
        window.clearTimeout(temporizador);
        resolve(valor);
      },
      (erro) => {
        window.clearTimeout(temporizador);
        reject(erro);
      }
    );
  });
}

function App() {
  const [aba, setAba] = useState("Dashboard");
  const [modal, setModal] = useState<string | null>(null);
  const [arquivoPagamentosAberto, setArquivoPagamentosAberto] = useState(false);
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

  const [registrosPagamentos, setRegistrosPagamentos] = useState<RegistroPagamento[]>(() =>
    ler<RegistroPagamento>("registrosPagamentos", [])
  );

  const [ferramentas, setFerramentas] = useState<Ferramenta[]>(() =>
    ler<Ferramenta>("ferramentas", [])
  );

  const [diarioObra, setDiarioObra] = useState<DiarioObra[]>(() =>
    ler<DiarioObra>("diarioObra", [])
  );
  const [diarioEditandoId, setDiarioEditandoId] = useState<number | null>(null);
  const [diarioFotoDescricao, setDiarioFotoDescricao] = useState("");
  const [diarioFotosRascunho, setDiarioFotosRascunho] = useState<FotoDiarioObra[]>([]);
  const [pdfGerado, setPdfGerado] = useState<{ url: string; nome: string; tipo: "diario" | "materiais" } | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState<string | null>(null);
  const [diariosSelecionadosPdf, setDiariosSelecionadosPdf] = useState<Array<number | string>>([]);
  const [materiaisSelecionadosPdf, setMateriaisSelecionadosPdf] = useState<Array<number | string>>([]);
  const diarioCameraInputRef = useRef<HTMLInputElement | null>(null);
  const diarioGaleriaInputRef = useRef<HTMLInputElement | null>(null);

  const [ferramentaForm, setFerramentaForm] = useState({
    nome: "", marca: "", modelo: "", quantidade: "1", valorUnitario: "",
    dataCompra: hoje, localizacao: "Estoque", obra: "", identificacao: "", observacao: ""
  });
  const [ferramentaEditandoId, setFerramentaEditandoId] = useState<number | null>(null);

  const [pessoaEditandoId, setPessoaEditandoId] = useState<number | null>(null);
  const [pessoaGerenciandoId, setPessoaGerenciandoId] = useState<number | null>(null);
  const [pessoaGerenciamento, setPessoaGerenciamento] = useState({ diaria: "", pix: "", diasTrabalhados: {} as Record<string, boolean> });
  const [semanasPessoaVisiveis, setSemanasPessoaVisiveis] = useState(1);
  const [semanasPessoaInicios, setSemanasPessoaInicios] = useState<string[]>([]);
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
    recebido: "",
    status: "Pendente" as Status,
  });

  const [obraEditandoId, setObraEditandoId] = useState<number | null>(null);

  const [pessoaForm, setPessoaForm] = useState({
    nome: "",
    funcao: "",
    telefone: "",
    cpf: "",
    endereco: "",
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

  const [diarioForm, setDiarioForm] = useState({
    obra: "",
    data: hoje,
    titulo: "",
    descricao: "",
    etapa: "",
    observacao: "",
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
  // O servidor recebe somente a versão mais recente. Várias alterações rápidas
  // (adicionar/apagar vários itens ou marcar vários pagamentos) são agrupadas.
  const timerGravacaoServidor = useRef<number | null>(null);
  const gravacaoServidorEmAndamento = useRef(false);
  const promessaGravacaoServidor = useRef<Promise<void> | null>(null);
  const resolverGravacaoServidor = useRef<(() => void) | null>(null);
  const rejeitarGravacaoServidor = useRef<((erro: unknown) => void) | null>(null);
  const geracaoGravacaoServidor = useRef(0);
  // Evita que o salvamento automático do useEffect duplique um salvamento
  // que já foi disparado diretamente por uma ação do usuário.
  const salvamentoDiretoPendente = useRef(false);
  // Impede que uma leitura antiga do servidor sobrescreva uma alteração local
  // que ainda está sendo enviada ou que acabou de ser enviada.
  const sincronizacaoRemotaEmAndamento = useRef(false);
  const sincronizacaoRemotaGeracao = useRef(0);
  const dadosRef = useRef<CloudDataComHistorico>({
    obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, registrosPagamentos, diarioObra,
  } as CloudDataComHistorico);
  const sessaoRef = useRef<AuthSession | null>(null);

  const dadosAtuais = (): CloudDataComHistorico => ({
    obras,
    tarefas,
    pessoas,
    materiais,
    despesas,
    pagamentos,
    ferramentas,
    registrosPagamentos,
    diarioObra,
  } as CloudDataComHistorico);

  // Mantém uma cópia dos dados mais recentes fora do ciclo de renderização.
  // Assim, nenhum salvamento usa uma versão antiga do estado.
  useEffect(() => {
    dadosRef.current = dadosAtuais();
  }, [obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, registrosPagamentos, diarioObra]);

  useEffect(() => {
    sessaoRef.current = sessao;
  }, [sessao]);

  const salvarAlteracaoImediata = (dados: CloudDataComHistorico, marcarSalvamentoDireto = true): Promise<void> => {
    const dadosComHistorico = {
      ...dados,
      registrosPagamentos:
        dados.registrosPagamentos ??
        (dadosRef.current as CloudDataComHistorico).registrosPagamentos ??
        [],
      diarioObra:
        dados.diarioObra ??
        (dadosRef.current as CloudDataComHistorico).diarioObra ??
        [],
    };
    // Não faça JSON.parse(JSON.stringify(...)) aqui: quando existem muitos
    // funcionários, pagamentos, materiais etc., essa cópia profunda pesa
    // bastante no celular e trava a interface durante o salvamento.
    // As listas são copiadas superficialmente e permanecem imutáveis pelo React.
    const snapshot: CloudDataComHistorico = {
      ...dadosComHistorico,
      obras: [...(dadosComHistorico.obras || [])],
      tarefas: [...(dadosComHistorico.tarefas || [])],
      pessoas: [...(dadosComHistorico.pessoas || [])],
      materiais: [...(dadosComHistorico.materiais || [])],
      despesas: [...(dadosComHistorico.despesas || [])],
      pagamentos: [...(dadosComHistorico.pagamentos || [])],
      ferramentas: [...(dadosComHistorico.ferramentas || [])],
      registrosPagamentos: [...(dadosComHistorico.registrosPagamentos || [])],
      diarioObra: [...(dadosComHistorico.diarioObra || [])],
    } as CloudDataComHistorico;

    // O cache principal v2 é a fonte atual. Gravar também sete chaves
    // individuais em todo clique duplicava JSON.stringify e I/O local,
    // principalmente quando o usuário incluía/apagava muitos registros.
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify(snapshot));
    } catch (erro) {
      console.warn("Não foi possível gravar o cache local:", erro);
    }

    dadosRef.current = snapshot;
    if (marcarSalvamentoDireto) salvamentoDiretoPendente.current = true;

    // Se já existe um envio pendente, não cria outro. O próximo envio usará
    // dadosRef.current, que sempre contém a versão mais nova.
    geracaoGravacaoServidor.current += 1;
    gravacoesPendentes.current = 1;
    setSincronizando(true);

    if (!promessaGravacaoServidor.current) {
      promessaGravacaoServidor.current = new Promise<void>((resolve, reject) => {
        resolverGravacaoServidor.current = resolve;
        rejeitarGravacaoServidor.current = reject;
      });
    }

    const agendarEnvio = () => {
      if (timerGravacaoServidor.current !== null) {
        window.clearTimeout(timerGravacaoServidor.current);
      }

      timerGravacaoServidor.current = window.setTimeout(() => {
        timerGravacaoServidor.current = null;
        if (gravacaoServidorEmAndamento.current) return;

        const iniciar = async () => {
          gravacaoServidorEmAndamento.current = true;
          const geracaoNoInicio = geracaoGravacaoServidor.current;
          const snapshotParaEnviar = dadosRef.current;

          try {
            const sessaoAtual = sessaoRef.current;
            if (!sessaoAtual || !cloudPronto) {
              gravacoesPendentes.current = 0;
              setSincronizando(false);
              resolverGravacaoServidor.current?.();
              promessaGravacaoServidor.current = null;
              resolverGravacaoServidor.current = null;
              rejeitarGravacaoServidor.current = null;
              return;
            }

            const stamp = await saveCloudData(sessaoAtual, snapshotParaEnviar);
            ultimoServidor.current = stamp;

            // Se o usuário alterou algo enquanto o envio estava acontecendo,
            // manda somente a versão mais nova, sem repetir as versões antigas.
            if (geracaoGravacaoServidor.current !== geracaoNoInicio) {
              gravacaoServidorEmAndamento.current = false;
              agendarEnvio();
              return;
            }

            gravacoesPendentes.current = 0;
            setSincronizando(false);
            resolverGravacaoServidor.current?.();
            promessaGravacaoServidor.current = null;
            resolverGravacaoServidor.current = null;
            rejeitarGravacaoServidor.current = null;
          } catch (erro) {
            console.error("Falha ao salvar os dados no servidor:", erro);
            // NÃO liberamos a leitura remota aqui. A versão local continua sendo
            // a mais nova até conseguir confirmação do servidor.
            gravacoesPendentes.current = 1;
            setSincronizando(true);
            rejeitarGravacaoServidor.current?.(erro);
            promessaGravacaoServidor.current = null;
            resolverGravacaoServidor.current = null;
            rejeitarGravacaoServidor.current = null;

            // Tenta novamente automaticamente. Isso evita que uma falha
            // momentânea de internet deixe o CGL preso numa versão antiga.
            window.setTimeout(() => {
              if (!sessaoRef.current || !cloudPronto || gravacaoServidorEmAndamento.current) return;
              void salvarAlteracaoImediata(dadosRef.current, false).catch(() => undefined);
            }, 5000);
          } finally {
            gravacaoServidorEmAndamento.current = false;
          }
        };

        void iniciar();
      }, 250);
    };

    agendarEnvio();
    return promessaGravacaoServidor.current;
  };

  const aplicarDados = (dados: CloudDataComHistorico) => {
    aplicandoDadosRemotos.current = true;

    // Normaliza dados antigos/online antes de colocá-los no estado.
    // Isso evita que um registro incompleto faça a tela quebrar após o login.
    const listaSegura = (valor: unknown): Record<string, unknown>[] =>
      Array.isArray(valor)
        ? valor.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        : [];

    const obrasSeguras: Obra[] = listaSegura(dados?.obras).map((obra) => ({
      id: Number(obra.id) || novoId(),
      nome: String(obra.nome ?? ""),
      cliente: String(obra.cliente ?? ""),
      local: String(obra.local ?? ""),
      inicio: String(obra.inicio ?? hoje),
      previsao: String(obra.previsao ?? ""),
      orcamento: Number(obra.orcamento) || 0,
      recebido: Math.max(0, Number(obra.recebido) || 0),
      status: (obra.status === "Em andamento" || obra.status === "Concluído" || obra.status === "Pendente")
        ? obra.status
        : "Pendente",
      equipe: Array.isArray(obra.equipe) ? obra.equipe.map(Number).filter(Number.isFinite) : [],
      etapas: Array.isArray(obra.etapas)
        ? obra.etapas.filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((etapa) => ({
            id: Number(etapa.id) || novoId(),
            nome: String(etapa.nome ?? ""),
            percentual: Math.max(0, Math.min(100, Number(etapa.percentual) || 0)),
          }))
        : [],
      fotos: Array.isArray(obra.fotos)
        ? obra.fotos.filter((f): f is Record<string, unknown> => !!f && typeof f === "object").map((foto) => ({
            id: Number(foto.id) || novoId(),
            nome: String(foto.nome ?? "Foto"),
            descricao: String(foto.descricao ?? ""),
            data: String(foto.data ?? hoje),
            url: String(foto.url ?? ""),
          })).filter((foto) => foto.url)
        : [],
    }));

    const tarefasSeguras: Tarefa[] = listaSegura(dados?.tarefas).map((item) => ({
      id: Number(item.id) || novoId(),
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      responsavel: String(item.responsavel ?? ""),
      prazo: String(item.prazo ?? ""),
      status: item.status === "Em andamento" || item.status === "Concluído" || item.status === "Pendente" ? item.status : "Pendente",
      percentual: Math.max(0, Math.min(100, Number(item.percentual ?? (item.status === "Concluído" ? 100 : 0)) || 0)),
    }));

    const pessoasSeguras: Pessoa[] = listaSegura(dados?.pessoas).map((item) => ({
      id: Number(item.id) || novoId(),
      nome: String(item.nome ?? ""),
      funcao: String(item.funcao ?? ""),
      telefone: String(item.telefone ?? ""),
      diaria: Number(item.diaria) || 0,
      pix: String(item.pix ?? ""),
      tipoPix: String(item.tipoPix ?? "Aleatória"),
      cpf: String(item.cpf ?? ""),
      endereco: String(item.endereco ?? ""),
      diasTrabalhados: item.diasTrabalhados && typeof item.diasTrabalhados === "object" ? item.diasTrabalhados as Record<string, boolean> : {},
      semanasGerenciadas: Array.isArray(item.semanasGerenciadas) ? item.semanasGerenciadas.map(String) : [],
    }));

    const materiaisSeguros: Material[] = listaSegura(dados?.materiais).map((item) => ({
      id: Number(item.id) || novoId(),
      obra: String(item.obra ?? ""),
      nome: String(item.nome ?? ""),
      quantidade: Number(item.quantidade) || 0,
      unidade: String(item.unidade ?? "un"),
      valor: Number(item.valor) || 0,
    }));

    const despesasSeguras: Despesa[] = listaSegura(dados?.despesas).map((item) => ({
      id: Number(item.id) || novoId(),
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      categoria: String(item.categoria ?? "Outros"),
      valor: Number(item.valor) || 0,
      data: String(item.data ?? hoje),
    }));

    const pagamentosSeguros: Pagamento[] = listaSegura(dados?.pagamentos).map((item) => ({
      id: Number(item.id) || novoId(),
      obra: String(item.obra ?? ""),
      descricao: String(item.descricao ?? ""),
      valor: Number(item.valor) || 0,
      data: String(item.data ?? hoje),
      status: (item.status === "Pago" ? "Pago" : "Pendente") as PagamentoStatus,
      funcionarioId: typeof item.funcionarioId === "number" ? item.funcionarioId : undefined,
      semanaInicio: item.semanaInicio ? String(item.semanaInicio) : undefined,
      semanaFim: item.semanaFim ? String(item.semanaFim) : undefined,
      diasTrabalhados: typeof item.diasTrabalhados === "number" ? item.diasTrabalhados : undefined,
      origem: item.origem === "diarias" ? "diarias" : item.origem === "manual" ? "manual" : undefined,
    }));

    const registrosPagamentosSeguros: RegistroPagamento[] = listaSegura(dados.registrosPagamentos).map((item) => ({
      id: Number(item.id) || novoId(),
      funcionarioId: Number(item.funcionarioId) || 0,
      nomeFuncionario: String(item.nomeFuncionario ?? ""),
      valor: Number(item.valor) || 0,
      diasTrabalhados: Number(item.diasTrabalhados) || 0,
      semanaInicio: String(item.semanaInicio ?? ""),
      semanaFim: String(item.semanaFim ?? ""),
      dataPagamento: String(item.dataPagamento ?? hoje),
    }));

    const extrasHistorico = dados as CloudData & { registrosPagamentos?: unknown[]; diarioObra?: unknown[] };
    const diarioObraSeguro: DiarioObra[] = listaSegura(extrasHistorico?.diarioObra).map((item) => ({
      id: Number(item.id) || novoId(),
      obra: String(item.obra ?? ""),
      data: String(item.data ?? hoje),
      titulo: String(item.titulo ?? "Registro do dia"),
      descricao: String(item.descricao ?? ""),
      etapa: String(item.etapa ?? ""),
      observacao: String(item.observacao ?? ""),
      fotos: Array.isArray(item.fotos)
        ? item.fotos
            .filter((foto): foto is Record<string, unknown> => !!foto && typeof foto === "object")
            .map((foto) => ({
              id: Number(foto.id) || novoId(),
              nome: String(foto.nome ?? "Foto da obra"),
              descricao: String(foto.descricao ?? ""),
              url: String(foto.url ?? ""),
              data: String(foto.data ?? item.data ?? hoje),
            }))
            .filter((foto) => foto.url)
        : [],
    }));

    const extras = dados as CloudData & { ferramentas?: unknown[] };
    const ferramentasSeguras: Ferramenta[] = listaSegura(extras?.ferramentas).map((item) => {
      const unidades = Array.isArray(item.unidades)
        ? item.unidades
            .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
            .map((u, indice) => ({
              id: String(u.id ?? `${Number(item.id) || novoId()}-${indice + 1}`),
              identificacao: String(u.identificacao ?? `${String(item.nome ?? "Ferramenta")} ${String(indice + 1).padStart(2, "0")}`),
              obra: String(u.obra ?? ""),
              localizacao: String(u.localizacao ?? (u.obra ? `Obra: ${String(u.obra)}` : "Estoque")),
            }))
        : [];

      // Compatibilidade com registros antigos: alguns dados podem ter
      // usado fabricante/brand em vez de marca. Nunca deixe a marca
      // desaparecer durante uma leitura do servidor.
      const marca = String(item.marca ?? item.fabricante ?? item.brand ?? "");
      const modelo = String(item.modelo ?? item.model ?? "");
      const valorBruto = item.valorUnitario ?? item.valor ?? 0;

      return {
        id: Number(item.id) || novoId(),
        nome: String(item.nome ?? ""),
        marca,
        modelo,
        quantidade: Math.max(1, Math.round(numero(String(item.quantidade ?? 1)))),
        valorUnitario: Math.max(0, numero(String(valorBruto))),
        dataCompra: String(item.dataCompra ?? hoje),
        localizacao: String(item.localizacao ?? "Estoque"),
        obra: String(item.obra ?? ""),
        identificacao: String(item.identificacao ?? ""),
        observacao: String(item.observacao ?? ""),
        unidades,
      };
    }).map((ferramenta) => {
      // Se houver unidades salvas, a quantidade real vem delas.
      // Se não houver, a quantidade do cadastro continua válida.
      return ferramenta.unidades.length > 0
        ? { ...ferramenta, quantidade: ferramenta.unidades.length }
        : ferramenta;
    });

    setObras(obrasSeguras);
    setTarefas(tarefasSeguras);
    setPessoas(pessoasSeguras);
    setMateriais(materiaisSeguros);
    setDespesas(despesasSeguras);
    setPagamentos(pagamentosSeguros);
    setFerramentas(ferramentasSeguras);
    setRegistrosPagamentos(registrosPagamentosSeguros);
    setDiarioObra(diarioObraSeguro);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!cloudConfigured) {
        setAuthCarregando(false);
        return;
      }
      const atual = await comTempoLimite(getSession(), 12000);
      if (!ativo) return;
      if (atual) {
        setSessao(atual);
        try {
          const remoto = await comTempoLimite(loadCloudData(atual), 15000);
          if (remoto.data) {
            aplicarDados(remoto.data);
            ultimoServidor.current = remoto.updatedAt;
          } else {
            const stamp = await comTempoLimite(saveCloudData(atual, dadosAtuais()), 15000);
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
      // Os handlers já salvam imediatamente. Neste caso, não faça um segundo
      // envio 500 ms depois da mesma alteração.
      if (salvamentoDiretoPendente.current) {
        salvamentoDiretoPendente.current = false;
        return;
      }
      void salvarAlteracaoImediata(dadosAtuais(), false).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(temporizador);
  }, [obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, registrosPagamentos, sessao, cloudPronto]);

  useEffect(() => {
    if (!sessao) return;
    const renovarSessao = async () => {
      const atual = await comTempoLimite(getSession(), 12000);
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
      // Nunca leia uma versão remota enquanto existe uma gravação local
      // pendente, agendada ou em andamento.
      if (gravacoesPendentes.current > 0 || gravacaoServidorEmAndamento.current || timerGravacaoServidor.current !== null) return;
      if (sincronizacaoRemotaEmAndamento.current) return;

      sincronizacaoRemotaEmAndamento.current = true;
      const sessaoDaLeitura = sessaoRef.current;
      const geracaoDaLeitura = geracaoGravacaoServidor.current;
      sincronizacaoRemotaGeracao.current = geracaoDaLeitura;

      try {
        if (!sessaoDaLeitura) return;
        const remoto = await loadCloudData(sessaoDaLeitura);

        // Se houve qualquer alteração local durante a leitura, a resposta
        // remota ficou velha e deve ser descartada.
        if (geracaoGravacaoServidor.current !== geracaoDaLeitura) return;
        if (gravacoesPendentes.current > 0 || gravacaoServidorEmAndamento.current || timerGravacaoServidor.current !== null) return;

        if (remoto.data && remoto.updatedAt && remoto.updatedAt !== ultimoServidor.current) {
          aplicarDados(remoto.data);
          ultimoServidor.current = remoto.updatedAt;
        }
      } catch (erro) {
        console.warn("Sincronização automática indisponível:", erro);
      } finally {
        sincronizacaoRemotaEmAndamento.current = false;
      }
    };

    const intervalo = window.setInterval(sincronizarDeOutroDispositivo, 8000);
    return () => {
      window.clearInterval(intervalo);
      sincronizacaoRemotaEmAndamento.current = false;
    };
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
      const novaSessao = await comTempoLimite(login(emailLogin, senhaLogin), 15000);
      const remoto = await comTempoLimite(loadCloudData(novaSessao), 15000);
      setSessao(novaSessao);
      if (remoto.data) {
        aplicarDados(remoto.data);
        ultimoServidor.current = remoto.updatedAt;
      } else {
        const stamp = await comTempoLimite(saveCloudData(novaSessao, dadosAtuais()), 15000);
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
    tipo: "obra" | "tarefa" | "pessoa" | "material" | "despesa" | "pagamento" | "ferramenta" | "diario",
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
    let novoDiarioObra = diarioObra;

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
    } else if (tipo === "diario") {
      novoDiarioObra = diarioObra.filter((item) => item.id !== id);
    }

    setObras(novasObras);
    setTarefas(novasTarefas);
    setPessoas(novasPessoas);
    setMateriais(novosMateriais);
    setDespesas(novasDespesas);
    setPagamentos(novosPagamentos);
    setFerramentas(novasFerramentas);
    setDiarioObra(novoDiarioObra);

    void salvarAlteracaoImediata({
      obras: novasObras, tarefas: novasTarefas, pessoas: novasPessoas,
      materiais: novosMateriais, despesas: novasDespesas,
      pagamentos: novosPagamentos, ferramentas: novasFerramentas, diarioObra: novoDiarioObra,
    } as CloudDataComHistorico);
  };

  const abrirModalDaAba = () => {
    if (aba === "Obras") { setObraEditandoId(null); setObraForm({ nome: "", cliente: "", local: "", inicio: hoje, previsao: "", orcamento: "", recebido: "", status: "Pendente" }); setModal("obra"); }
    else if (aba === "Tarefas") { setTarefaEditandoId(null); setModal("tarefa"); }
    else if (aba === "Funcionários") { setPessoaEditandoId(null); setModal("pessoa"); }
    else if (aba === "Materiais") { setMaterialEditandoId(null); setModal("material"); }
    else if (aba === "Despesas") { setDespesaEditandoId(null); setModal("despesa"); }
    else if (aba === "Pagamentos") { setPagamentoEditandoId(null); setModal("pagamento"); }
    else if (aba === "Ferramentas") { setFerramentaEditandoId(null); setModal("ferramenta"); }
    else if (aba === "Diário de Obra") { setDiarioEditandoId(null); setDiarioFotoDescricao(""); setDiarioFotosRascunho([]); setDiarioForm({ obra: obras[0]?.nome || "", data: hoje, titulo: "", descricao: "", etapa: "", observacao: "" }); setModal("diarioObra"); }
    else setModal("obra");
  };

  const adicionarObra = () => {
    if (!obraForm.nome.trim()) {
      alert("Informe o nome da obra.");
      return;
    }
    
    const anterior = obraEditandoId === null ? undefined : obras.find((item) => item.id === obraEditandoId);
    const nova: Obra = {
      id: obraEditandoId ?? novoId(), nome: obraForm.nome.trim(), cliente: obraForm.cliente.trim(), local: obraForm.local.trim(), inicio: obraForm.inicio, previsao: obraForm.previsao, orcamento: numero(obraForm.orcamento), recebido: Math.min(Math.max(0, numero(obraForm.recebido)), Math.max(0, numero(obraForm.orcamento))), status: obraForm.status, equipe: anterior?.equipe || [], etapas: anterior?.etapas || [], fotos: anterior?.fotos || [],
    };
    const novasObras = obraEditandoId === null ? [...obras, nova] : obras.map((item) => item.id === obraEditandoId ? nova : item);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);

    setObraForm({
      nome: "",
      cliente: "",
      local: "",
      inicio: hoje,
      previsao: "",
      orcamento: "",
      recebido: "",
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
    recebido: String(obra.recebido ?? ""),
    status: obra.status,
  });

  setObraEditandoId(obra.id);
  setModal("obra");
};
      
  const inicioSemanaAtual = () => {
    const data = new Date();
    data.setHours(0, 0, 0, 0);
    data.setDate(data.getDate() - data.getDay());
    return data;
  };

  const gerarSemanaPessoa = (offsetSemanas: number) => {
    const nomes = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const inicio = inicioSemanaAtual();
    inicio.setDate(inicio.getDate() + offsetSemanas * 7);

    return nomes.map((nome, index) => {
      const data = new Date(inicio);
      data.setDate(inicio.getDate() + index);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

      return {
        nome,
        chave,
        data: data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      };
    });
  };

  const semanasPessoa = useMemo(() => {
    const inicios = [...semanasPessoaInicios];

    // Compatibilidade com registros antigos: se houver mais semanas visíveis
    // do que datas salvas, cria as semanas consecutivas que faltam.
    for (let index = inicios.length; index < semanasPessoaVisiveis; index++) {
      const semana = gerarSemanaPessoa(index);
      if (semana[0] && !inicios.includes(semana[0].chave)) {
        inicios.push(semana[0].chave);
      }
    }

    return inicios.map((inicioChave) => {
      const inicio = new Date(`${inicioChave}T00:00:00`);
      const nomes = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      return nomes.map((nome, index) => {
        const data = new Date(inicio);
        data.setDate(inicio.getDate() + index);
        const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
        return {
          nome,
          chave,
          data: data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        };
      });
    });
  }, [semanasPessoaInicios, semanasPessoaVisiveis]);

  const diasPessoaVisiveis = useMemo(
    () => semanasPessoa.flat(),
    [semanasPessoa]
  );

  const pessoaGerenciando = pessoas.find((item) => item.id === pessoaGerenciandoId) || null;

  const abrirGerenciamentoPessoa = (id: number) => {
    const pessoa = pessoas.find((item) => item.id === id);
    if (!pessoa) return;

    setPessoaGerenciandoId(id);
    setPessoaGerenciamento({
      diaria: String(pessoa.diaria ?? ""),
      pix: String(pessoa.pix ?? ""),
      diasTrabalhados: { ...(pessoa.diasTrabalhados || {}) },
    });

    const semanaAtual = gerarSemanaPessoa(0)[0].chave;
    const semanasSalvas = Array.isArray(pessoa.semanasGerenciadas) && pessoa.semanasGerenciadas.length
      ? pessoa.semanasGerenciadas
      : [semanaAtual];
    setSemanasPessoaInicios(semanasSalvas);
    setSemanasPessoaVisiveis(semanasSalvas.length);
    setModal("gerenciarPessoa");
  };

  const copiarPix = async (pix: string) => {
    const chave = String(pix || "").trim();
    if (!chave) {
      alert("Este funcionário ainda não possui uma chave Pix cadastrada.");
      return;
    }

    try {
      await navigator.clipboard.writeText(chave);
      alert("Chave Pix copiada!");
    } catch {
      const area = document.createElement("textarea");
      area.value = chave;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      try {
        document.execCommand("copy");
        alert("Chave Pix copiada!");
      } catch {
        alert("Não foi possível copiar a chave Pix.");
      }
      document.body.removeChild(area);
    }
  };

  const alternarDiaPessoa = (chave: string) => {
    setPessoaGerenciamento((atual) => ({
      ...atual,
      diasTrabalhados: {
        ...atual.diasTrabalhados,
        [chave]: !atual.diasTrabalhados[chave],
      },
    }));
  };

  // Altera somente o início da semana escolhida. Os outros 6 dias
  // são recalculados automaticamente a partir dessa nova data.
  const alterarInicioSemanaPessoa = (indiceSemana: number, novaData: string) => {
    if (!novaData) return;

    setSemanasPessoaInicios((atuais) => {
      const proximas = [...atuais];
      proximas[indiceSemana] = novaData;
      return proximas;
    });
  };

  const salvarGerenciamentoPessoa = async () => {
    if (!pessoaGerenciando) return;

    const diariaAtualizada = Math.max(0, numero(pessoaGerenciamento.diaria));
    const diasAtualizados = { ...pessoaGerenciamento.diasTrabalhados };

    const novasPessoas = pessoas.map((pessoa) =>
      pessoa.id === pessoaGerenciando.id
        ? {
            ...pessoa,
            diaria: diariaAtualizada,
            pix: pessoaGerenciamento.pix.trim(),
            diasTrabalhados: diasAtualizados,
            semanasGerenciadas: semanasPessoa.map((semana) => semana[0].chave),
          }
        : pessoa
    );

    // Cada semana salva em Funcionários vira/atualiza automaticamente um pagamento.
    // Assim, a aba Pagamentos apenas exibe o resultado, sem precisar editar esse registro.
    const pagamentosManuais = pagamentos.filter(
      (pagamento) =>
        pagamento.origem !== "diarias" ||
        pagamento.funcionarioId !== pessoaGerenciando.id
    );

    const pagamentosSemanaisDoFuncionario = pagamentos.filter(
      (pagamento) =>
        pagamento.origem === "diarias" &&
        pagamento.funcionarioId === pessoaGerenciando.id
    );

    const pagamentosSemanaisAtualizados: Pagamento[] = [];

    semanasPessoa.forEach((semana) => {
      const diasTrabalhados = semana.filter(
        (dia) => !!diasAtualizados[dia.chave]
      ).length;

      const totalSemana = diasTrabalhados * diariaAtualizada;
      if (diasTrabalhados <= 0 || totalSemana <= 0) return;

      const semanaInicio = semana[0].chave;
      const semanaFim = semana[6].chave;
      const existente = pagamentosSemanaisDoFuncionario.find(
        (pagamento) =>
          pagamento.semanaInicio === semanaInicio &&
          pagamento.semanaFim === semanaFim
      );

      pagamentosSemanaisAtualizados.push({
        id: existente?.id ?? novoId(),
        obra: "",
        descricao: `${pessoaGerenciando.nome} • ${diasTrabalhados} ${
          diasTrabalhados === 1 ? "dia" : "dias"
        } trabalhados • Semana ${semana[0].data} a ${semana[6].data}`,
        valor: totalSemana,
        data: semanaFim,
        status: existente?.status ?? "Pendente",
        funcionarioId: pessoaGerenciando.id,
        semanaInicio,
        semanaFim,
        diasTrabalhados,
        origem: "diarias",
      });
    });

    const novosPagamentos = [
      ...pagamentosManuais,
      ...pagamentosSemanaisAtualizados,
    ];

    setPessoas(novasPessoas);
    setPagamentos(novosPagamentos);

    try {
      await salvarAlteracaoImediata({
        obras,
        tarefas,
        pessoas: novasPessoas,
        materiais,
        despesas,
        pagamentos: novosPagamentos,
        ferramentas,
      } as CloudDataComHistorico);
      setModal(null);
      setPessoaGerenciandoId(null);
    } catch {
      alert("Não foi possível salvar o gerenciamento do funcionário.");
    }
  };

  const alternarStatusPagamento = async (id: number) => {
    const pagamento = pagamentos.find((item) => item.id === id);
    if (!pagamento) return;

    if (pagamento.origem === "diarias" && pagamento.funcionarioId && pagamento.status !== "Pago") {
      const pessoa = pessoas.find((item) => item.id === pagamento.funcionarioId);
      const diasChaves = pessoa?.diasTrabalhados
        ? Object.entries(pessoa.diasTrabalhados)
            .filter(([chave, trabalhou]) => {
              if (!trabalhou) return false;
              if (!pagamento.semanaInicio || !pagamento.semanaFim) return true;
              return chave >= pagamento.semanaInicio && chave <= pagamento.semanaFim;
            })
            .map(([chave]) => chave)
        : [];

      const registro: RegistroPagamento = {
        id: novoId(),
        funcionarioId: pagamento.funcionarioId,
        nomeFuncionario: pessoa?.nome || pagamento.descricao.split(" • ")[0],
        valor: pagamento.valor,
        diasTrabalhados: pagamento.diasTrabalhados || 0,
        semanaInicio: pagamento.semanaInicio || "",
        semanaFim: pagamento.semanaFim || "",
        dataPagamento: hoje,
        diasChaves,
      };
      const novosRegistros = [registro, ...registrosPagamentos];
      const novosPagamentos = pagamentos.filter((item) => item.id !== id);
      const novasPessoas = pessoas.map((p) => {
        if (p.id !== pagamento.funcionarioId) return p;
        const dias = { ...(p.diasTrabalhados || {}) };
        if (pagamento.semanaInicio && pagamento.semanaFim) {
          const inicio = new Date(`${pagamento.semanaInicio}T00:00:00`);
          for (let i = 0; i < 7; i++) {
            const d = new Date(inicio); d.setDate(inicio.getDate() + i);
            const chave = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
            delete dias[chave];
          }
        }
        return { ...p, diasTrabalhados: dias };
      });
      setPagamentos(novosPagamentos); setPessoas(novasPessoas); setRegistrosPagamentos(novosRegistros);
      try {
        await salvarAlteracaoImediata({ obras, tarefas, pessoas: novasPessoas, materiais, despesas, pagamentos: novosPagamentos, ferramentas, registrosPagamentos: novosRegistros } as CloudDataComHistorico);
      } catch {
        setPagamentos(pagamentos); setPessoas(pessoas); setRegistrosPagamentos(registrosPagamentos);
        alert("Não foi possível registrar o pagamento.");
      }
      return;
    }

    const novosPagamentos: Pagamento[] = pagamentos.map((p) => p.id === id ? { ...p, status: (p.status === "Pago" ? "Pendente" : "Pago") as PagamentoStatus } : p);
    setPagamentos(novosPagamentos);
    try { await salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos: novosPagamentos, ferramentas } as CloudDataComHistorico); }
    catch { setPagamentos(pagamentos); alert("Não foi possível atualizar o status do pagamento."); }
  };

  const voltarPagamentoParaPendentes = async (registroId: number) => {
    const registro = registrosPagamentos.find((item) => item.id === registroId);
    if (!registro) return;

    const pagamentoPendente: Pagamento = {
      id: novoId(),
      funcionarioId: registro.funcionarioId,
      obra: "",
      descricao: `${registro.nomeFuncionario} • Diárias`,
      valor: registro.valor,
      data: hoje,
      status: "Pendente",
      semanaInicio: registro.semanaInicio,
      semanaFim: registro.semanaFim,
      diasTrabalhados: registro.diasTrabalhados,
      origem: "diarias",
    };

    const novosPagamentos = [pagamentoPendente, ...pagamentos];
    const novosRegistros = registrosPagamentos.filter((item) => item.id !== registroId);

    const novasPessoas = pessoas.map((pessoa) => {
      if (pessoa.id !== registro.funcionarioId) return pessoa;
      const dias = { ...(pessoa.diasTrabalhados || {}) };
      for (const chave of registro.diasChaves || []) dias[chave] = true;
      return { ...pessoa, diasTrabalhados: dias };
    });

    setPagamentos(novosPagamentos);
    setRegistrosPagamentos(novosRegistros);
    setPessoas(novasPessoas);

    try {
      await salvarAlteracaoImediata({
        obras,
        tarefas,
        pessoas: novasPessoas,
        materiais,
        despesas,
        pagamentos: novosPagamentos,
        ferramentas,
        registrosPagamentos: novosRegistros,
      } as CloudDataComHistorico);
    } catch {
      setPagamentos(pagamentos);
      setRegistrosPagamentos(registrosPagamentos);
      setPessoas(pessoas);
      alert("Não foi possível devolver este pagamento para a lista de pagamentos.");
    }
  };

  const excluirRegistroPagamento = async (registroId: number) => {
    const registro = registrosPagamentos.find((item) => item.id === registroId);
    if (!registro) return;

    const confirmar = window.confirm(
      `Apagar definitivamente o registro de pagamento de ${registro.nomeFuncionario}?`
    );
    if (!confirmar) return;

    const novosRegistros = registrosPagamentos.filter((item) => item.id !== registroId);
    setRegistrosPagamentos(novosRegistros);

    try {
      await salvarAlteracaoImediata({
        obras,
        tarefas,
        pessoas,
        materiais,
        despesas,
        pagamentos,
        ferramentas,
        registrosPagamentos: novosRegistros,
      } as CloudDataComHistorico);
    } catch {
      setRegistrosPagamentos(registrosPagamentos);
      alert("Não foi possível apagar o registro.");
    }
  };

  const diasTrabalhadosSemana = diasPessoaVisiveis.filter(
    (dia) => !!pessoaGerenciamento.diasTrabalhados[dia.chave]
  ).length;

  const totalPagarSemana =
    diasTrabalhadosSemana * Math.max(0, numero(pessoaGerenciamento.diaria));

  const adicionarPessoa = async () => {
    if (!pessoaForm.nome.trim()) {
      alert("Informe o nome do funcionário.");
      return;
    }

    const pessoaAnterior = pessoaEditandoId === null
      ? null
      : pessoas.find((item) => item.id === pessoaEditandoId);

    const nova: Pessoa = {
      id: pessoaEditandoId ?? novoId(),
      nome: pessoaForm.nome.trim(),
      funcao: pessoaForm.funcao.trim(),
      telefone: pessoaForm.telefone.trim(),
      diaria: pessoaAnterior?.diaria || 0,
      pix: pessoaAnterior?.pix || "",
      tipoPix: pessoaAnterior?.tipoPix || "Aleatória",
      cpf: pessoaForm.cpf.trim(),
      endereco: pessoaForm.endereco.trim(),
      diasTrabalhados: pessoaAnterior?.diasTrabalhados || {},
      semanasGerenciadas: pessoaAnterior?.semanasGerenciadas || [],
    };

    const novasPessoas = pessoaEditandoId === null
      ? [...pessoas, nova]
      : pessoas.map((item) => item.id === pessoaEditandoId ? nova : item);

    // Atualiza a tela imediatamente, mas só fecha o formulário depois
    // que o salvamento for concluído. Isso evita o funcionário "sumir"
    // quando o envio ao servidor falha.
    setPessoas(novasPessoas);

    try {
      await salvarAlteracaoImediata({
        obras,
        tarefas,
        pessoas: novasPessoas,
        materiais,
        despesas,
        pagamentos,
        ferramentas,
        registrosPagamentos,
      } as CloudDataComHistorico);

      setPessoaForm({ nome: "", funcao: "", telefone: "", cpf: "", endereco: "" });
      setPessoaEditandoId(null);
      setModal(null);
    } catch (erro) {
      console.error("Falha ao salvar funcionário:", erro);
      alert("O funcionário foi adicionado na tela, mas não foi possível confirmar o salvamento online. Verifique a conexão e tente salvar novamente.");
    }
  };

  const editarPessoa = (id: number) => {
    const p = pessoas.find((item) => item.id === id);
    if (!p) return;
    setPessoaForm({ nome: p.nome || "", funcao: p.funcao || "", telefone: p.telefone || "", cpf: p.cpf || "", endereco: p.endereco || "" });
    setPessoaEditandoId(id); setModal("pessoa");
  };
     
const adicionarEtapa = () => {
    if (!obraAtual) return;
    if (!etapaForm.nome.trim()) { alert("Informe o nome da etapa."); return; }
    const percentual = Math.max(0, Math.min(100, numero(etapaForm.percentual)));
    const novasObras = obras.map((obra) => obra.id === obraAtual.id ? { ...obra, etapas: [...(obra.etapas || []), { id: novoId(), nome: etapaForm.nome.trim(), percentual }] } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);
    setEtapaForm({ nome: "", percentual: "0" });
  };

  const alterarEtapa = (obraId: number, etapaId: number, percentual: number) => {
    const valor = Math.max(0, Math.min(100, percentual));
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).map((etapa) => etapa.id === etapaId ? { ...etapa, percentual: valor } : etapa) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);
  };

  const editarNomeEtapa = (obraId: number, etapaId: number, nome: string) => {
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).map((etapa) => etapa.id === etapaId ? { ...etapa, nome } : etapa) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);
  };

  const excluirEtapa = (obraId: number, etapaId: number) => {
    if (!window.confirm("Excluir esta etapa?")) return;
    const novasObras = obras.map((obra) => obra.id === obraId ? { ...obra, etapas: (obra.etapas || []).filter((etapa) => etapa.id !== etapaId) } : obra);
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);
  };

  const alternarPessoaNaObra = (obraId: number, pessoaId: number) => {
    const novasObras = obras.map((obra) => {
      if (obra.id !== obraId) return obra;
      const equipe = obra.equipe || [];
      return equipe.includes(pessoaId) ? { ...obra, equipe: equipe.filter((id) => id !== pessoaId) } : { ...obra, equipe: [...equipe, pessoaId] };
    });
    setObras(novasObras);
    void salvarAlteracaoImediata({ obras: novasObras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);
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
    } as CloudDataComHistorico).catch(() => undefined);
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
    } as CloudDataComHistorico).catch(() => undefined);
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
    void salvarAlteracaoImediata({ obras, tarefas: novasTarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico).catch(() => undefined);
  };

  const adicionarTarefa = () => {
    if (!tarefaForm.descricao.trim()) {
      alert("Informe a descrição da tarefa.");
      return;
    }

    const nova: Tarefa = {
      id: tarefaEditandoId ?? novoId(),
      obra: tarefaForm.obra,
      descricao: tarefaForm.descricao.trim(),
      responsavel: tarefaForm.responsavel.trim(),
      prazo: tarefaForm.prazo,
      status: tarefaForm.percentual === "100" ? "Concluído" : tarefaForm.status,
      percentual: Math.max(0, Math.min(100, numero(tarefaForm.percentual))),
    };

    const novasTarefas = tarefaEditandoId === null ? [...tarefas, nova] : tarefas.map((item) => item.id === tarefaEditandoId ? nova : item);
    setTarefas(novasTarefas);
    void salvarAlteracaoImediata({ obras, tarefas: novasTarefas, pessoas, materiais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);

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
      id: materialEditandoId ?? novoId(),
      obra: materialForm.obra,
      nome: materialForm.nome.trim(),
      quantidade: numero(materialForm.quantidade),
      unidade: materialForm.unidade,
      valor: numero(materialForm.valor),
    };

    const novosMateriais = materialEditandoId === null ? [...materiais, novo] : materiais.map((item) => item.id === materialEditandoId ? novo : item);
    setMateriais(novosMateriais);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais: novosMateriais, despesas, pagamentos, ferramentas } as CloudDataComHistorico);

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
      id: despesaEditandoId ?? novoId(),
      obra: despesaForm.obra,
      descricao: despesaForm.descricao.trim(),
      categoria: despesaForm.categoria,
      valor: numero(despesaForm.valor),
      data: despesaForm.data,
    };

    const novasDespesas = despesaEditandoId === null ? [...despesas, nova] : despesas.map((item) => item.id === despesaEditandoId ? nova : item);
    setDespesas(novasDespesas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas: novasDespesas, pagamentos, ferramentas } as CloudDataComHistorico);

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
      id: pagamentoEditandoId ?? novoId(),
      obra: pagamentoForm.obra,
      descricao: pagamentoForm.descricao.trim(),
      valor: numero(pagamentoForm.valor),
      data: pagamentoForm.data,
      status: pagamentoForm.status,
    };

    const novosPagamentos = pagamentoEditandoId === null ? [...pagamentos, novo] : pagamentos.map((item) => item.id === pagamentoEditandoId ? novo : item);
    setPagamentos(novosPagamentos);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos: novosPagamentos, ferramentas } as CloudDataComHistorico);

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
        id: `${ferramenta.id}-${novoId()}-${indice}`,
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

  const normalizarFerramentaParaSalvar = (ferramenta: Ferramenta): Ferramenta => {
    const unidades = unidadesDaFerramenta(ferramenta).map((unidade, indice) => ({
      id: String(unidade.id || `${ferramenta.id}-${indice + 1}`),
      identificacao: String(unidade.identificacao || `${ferramenta.nome} ${String(indice + 1).padStart(2, "0")}`),
      obra: String(unidade.obra || ""),
      localizacao: String(unidade.localizacao || (unidade.obra ? `Obra: ${unidade.obra}` : "Estoque")),
    }));

    return {
      ...ferramenta,
      nome: String(ferramenta.nome ?? "").trim(),
      marca: String(ferramenta.marca ?? "").trim(),
      modelo: String(ferramenta.modelo ?? "").trim(),
      quantidade: Math.max(1, unidades.length || Math.round(Number(ferramenta.quantidade) || 1)),
      valorUnitario: Math.max(0, Number(ferramenta.valorUnitario) || 0),
      dataCompra: String(ferramenta.dataCompra ?? hoje),
      localizacao: String(ferramenta.localizacao ?? "Estoque"),
      obra: String(ferramenta.obra ?? ""),
      identificacao: String(ferramenta.identificacao ?? "").trim(),
      observacao: String(ferramenta.observacao ?? "").trim(),
      unidades,
    };
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
    const id = ferramentaEditandoId ?? novoId();
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

    const nova: Ferramenta = normalizarFerramentaParaSalvar({
      ...ferramentaBase,
      unidades,
      quantidade: unidades.length,
    });

    const novasFerramentas = ferramentaEditandoId === null ? [...ferramentas, nova] : ferramentas.map((item) => item.id === ferramentaEditandoId ? nova : item);
    setFerramentas(novasFerramentas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas: novasFerramentas.map(normalizarFerramentaParaSalvar) } as CloudDataComHistorico);

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
      const unidades = unidadesDaFerramenta(f).map((unidade) =>
        unidade.id === unidadeId
          ? { ...unidade, obra, localizacao: obra ? `Obra: ${obra}` : "Estoque" }
          : unidade
      );
      return normalizarFerramentaParaSalvar({
        ...f,
        unidades,
        quantidade: unidades.length,
        obra: unidades.length === 1 ? unidades[0].obra : "",
        localizacao: unidades.length === 1 ? unidades[0].localizacao : "Distribuída entre estoque e obras",
      });
    });
    setFerramentas(novasFerramentas);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas: novasFerramentas.map(normalizarFerramentaParaSalvar) } as CloudDataComHistorico);
  };

  const comprimirFoto = (arquivo: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("Não foi possível ler a foto."));
      leitor.onload = () => {
        const imagem = new Image();
        imagem.onerror = () => reject(new Error("Não foi possível processar a foto."));
        imagem.onload = () => {
          const limite = 1600;
          const escala = Math.min(1, limite / Math.max(imagem.naturalWidth || imagem.width, imagem.naturalHeight || imagem.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((imagem.naturalWidth || imagem.width) * escala));
          canvas.height = Math.max(1, Math.round((imagem.naturalHeight || imagem.height) * escala));
          const contexto = canvas.getContext("2d");
          if (!contexto) {
            reject(new Error("Não foi possível preparar a foto."));
            return;
          }
          contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
          // Mantém a foto com boa qualidade, mas reduz bastante o tamanho do
          // JSON enviado ao Supabase. Isso evita que a foto apareça na hora e
          // desapareça depois de recarregar por falha no salvamento remoto.
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        imagem.src = String(leitor.result || "");
      };
      leitor.readAsDataURL(arquivo);
    });

  const adicionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !obraAtual) return;
    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem.");
      return;
    }

    try {
      const url = await comprimirFoto(arquivo);
      const novasObras = obras.map((obra) =>
        obra.id === obraAtual.id
          ? {
              ...obra,
              fotos: [
                ...(obra.fotos || []),
                {
                  id: novoId(),
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

      try {
        await salvarAlteracaoImediata({
          obras: novasObras,
          tarefas,
          pessoas,
          materiais,
          despesas,
          pagamentos,
          ferramentas,
        } as CloudDataComHistorico);
      } catch (erro) {
        console.error("Falha ao salvar a foto no servidor:", erro);
        alert("A foto foi adicionada, mas não foi possível salvá-la online. Verifique a conexão e tente novamente.");
      }
    } catch (erro) {
      console.error("Falha ao processar a foto:", erro);
      alert("Não foi possível processar essa foto. Tente outra imagem.");
    }
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
    } as CloudDataComHistorico);
  };

  const salvarDiarioObra = () => {
    if (!diarioForm.titulo.trim()) {
      alert("Informe o título do registro.");
      return;
    }
    if (!diarioForm.obra.trim()) {
      alert("Selecione a obra.");
      return;
    }
    if (!diarioForm.descricao.trim()) {
      alert("Descreva o que foi realizado no dia.");
      return;
    }

    const anterior = diarioEditandoId === null
      ? undefined
      : diarioObra.find((item) => item.id === diarioEditandoId);

    const novoRegistro: DiarioObra = {
      id: diarioEditandoId ?? novoId(),
      obra: diarioForm.obra,
      data: diarioForm.data || hoje,
      titulo: diarioForm.titulo.trim(),
      descricao: diarioForm.descricao.trim(),
      etapa: diarioForm.etapa.trim(),
      observacao: diarioForm.observacao.trim(),
      fotos: diarioEditandoId === null ? diarioFotosRascunho : (anterior?.fotos || []),
    };

    const novosRegistros = diarioEditandoId === null
      ? [novoRegistro, ...diarioObra]
      : diarioObra.map((item) => item.id === diarioEditandoId ? novoRegistro : item);

    setDiarioObra(novosRegistros);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, diarioObra: novosRegistros } as CloudDataComHistorico);
    setDiarioEditandoId(null);
    setDiarioFotoDescricao("");
    setDiarioFotosRascunho([]);
    setDiarioForm({ obra: obras[0]?.nome || "", data: hoje, titulo: "", descricao: "", etapa: "", observacao: "" });
    setModal(null);
  };

  const editarDiarioObra = (id: number) => {
    const registro = diarioObra.find((item) => item.id === id);
    if (!registro) return;
    setDiarioForm({
      obra: registro.obra,
      data: registro.data || hoje,
      titulo: registro.titulo || "",
      descricao: registro.descricao || "",
      etapa: registro.etapa || "",
      observacao: registro.observacao || "",
    });
    setDiarioEditandoId(id);
    setDiarioFotoDescricao("");
    setDiarioFotosRascunho(registro.fotos || []);
    setModal("diarioObra");
  };

  const adicionarFotoDiario = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem.");
      return;
    }

    try {
      const url = await comprimirFoto(arquivo);
      const foto: FotoDiarioObra = {
        id: novoId(),
        nome: arquivo.name,
        descricao: diarioFotoDescricao.trim(),
        url,
        data: hoje,
      };

      if (diarioEditandoId === null) {
        setDiarioFotosRascunho((fotos) => [...fotos, foto]);
      } else {
        const novosRegistros = diarioObra.map((registro) =>
          registro.id === diarioEditandoId
            ? { ...registro, fotos: [...(registro.fotos || []), foto] }
            : registro
        );
        setDiarioObra(novosRegistros);
        void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, diarioObra: novosRegistros } as CloudDataComHistorico);
      }

      setDiarioFotoDescricao("");
      if (diarioCameraInputRef.current) diarioCameraInputRef.current.value = "";
      if (diarioGaleriaInputRef.current) diarioGaleriaInputRef.current.value = "";
    } catch (erro) {
      console.error("Falha ao processar foto do diário:", erro);
      alert("Não foi possível processar essa foto. Tente outra imagem.");
    }
  };

  const excluirFotoDiarioRascunho = (fotoId: number) => {
    setDiarioFotosRascunho((fotos) => fotos.filter((foto) => foto.id !== fotoId));
  };

  const excluirFotoDiario = (registroId: number, fotoId: number) => {
    if (!window.confirm("Excluir esta foto do diário?")) return;
    const novosRegistros = diarioObra.map((registro) =>
      registro.id === registroId
        ? { ...registro, fotos: (registro.fotos || []).filter((foto) => foto.id !== fotoId) }
        : registro
    );
    setDiarioObra(novosRegistros);
    void salvarAlteracaoImediata({ obras, tarefas, pessoas, materiais, despesas, pagamentos, ferramentas, diarioObra: novosRegistros } as CloudDataComHistorico);
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
            <p className="authSubtitle">Seu Gerenciamento de Obras, em qualquer dispositivo.</p>
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
    ["Diário de Obra", ""],
  ];

  const Header = () => (
    <header>
      <div>
        <h1>{aba}</h1>
        <span>CGL • Gerenciamento de Obras</span>
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
  // O Dashboard sempre destaca a primeira obra que ainda não está concluída.
  // A ordem original é preservada: se uma obra voltar para Pendente ou Em andamento,
  // ela volta a ser elegível para o destaque automaticamente.
  const obraDestaque = obras.find((obra) => obra.status !== "Concluído");
  const fotoDestaque = obraDestaque?.fotos?.[0]?.url;
  const recebidoDestaque = obraDestaque
    ? Math.max(0, Number(obraDestaque.recebido || 0))
    : 0;
  const aReceberDestaque = obraDestaque
    ? Math.max(0, Number(obraDestaque.orcamento || 0) - recebidoDestaque)
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
          {fotoDestaque ? <img className="projectImage" src={fotoDestaque} alt="Obra em destaque"/> : <div className="projectImage" style={{background:"linear-gradient(135deg,#d8edf8,#edf6fb)"}}/>}
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
                <div><span>Início</span><strong>{obraDestaque.inicio || "-"}</strong></div>
                <div><span>Orçamento</span><strong>{dinheiro(obraDestaque.orcamento)}</strong></div>
                <div><span>Recebido</span><strong>{dinheiro(recebidoDestaque)}</strong></div>
                <div><span>A receber</span><strong>{dinheiro(aReceberDestaque)}</strong></div>
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
            <div className="legendRow"><i className="dot blue"/> Progresso <b style={{marginLeft:"auto",color:"#344b61"}}>{Math.round(progressoGeral)}%</b></div>
            <div className="legendRow"><i className="dot green"/> Em andamento <b style={{marginLeft:"auto",color:"#344b61"}}>{obras.filter(o=>o.status==="Em andamento").length}</b></div>
            <div className="legendRow"><i className="dot orange"/> Pendente <b style={{marginLeft:"auto",color:"#344b61"}}>{obras.filter(o=>o.status==="Pendente").length}</b></div>
          </div>
        </section>
      </div>
      <div className="dashboardBottom">
        <section className="panel" style={{margin:0}}><div className="panelHeader"><div><h2>Despesas por categoria</h2><p>Distribuição dos gastos registrados.</p></div><button className="secondary" onClick={()=>setAba("Despesas")}>Ver detalhes</button></div><div className="chartBars">{despesasPorCategoria.map(([nome,valor], index) => {
          const cores = ["#f2a24a", "#1597f5", "#27c995", "#8b63e8"];
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
              Cadastre equipe, CPF, endereço e acompanhe os dias trabalhados.
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

                  <p>CPF: {pessoa.cpf || "Não cadastrado"}</p>
                  <p>Endereço: {pessoa.endereco || "Não cadastrado"}</p>
                  <strong>Diária: {dinheiro(pessoa.diaria)}</strong>
                  <button
                    className="secondary pixCopyButton"
                    type="button"
                    onClick={() => copiarPix(pessoa.pix)}
                  >
                    📋 Copiar chave Pix
                  </button>
                  <button className="secondary" onClick={() => abrirGerenciamentoPessoa(pessoa.id)}>📅 Gerenciar dias</button>
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


  type PdfImagem = { bytes: Uint8Array; largura: number; altura: number; nome: string };
  type PdfPagina = { conteudo: string; imagens: PdfImagem[] };

  const bytesTextoPdf = (valor: string) => {
    const mapa: Record<string, number> = {
      "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
      "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
      "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
      "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
      "Á": 0xc1, "À": 0xc0, "Â": 0xc2, "Ã": 0xc3, "Ä": 0xc4, "Ç": 0xc7, "É": 0xc9,
      "Ê": 0xca, "Í": 0xcd, "Ó": 0xd3, "Ô": 0xd4, "Õ": 0xd5, "Ú": 0xda, "á": 0xe1,
      "à": 0xe0, "â": 0xe2, "ã": 0xe3, "ä": 0xe4, "ç": 0xe7, "é": 0xe9, "ê": 0xea,
      "í": 0xed, "ó": 0xf3, "ô": 0xf4, "õ": 0xf5, "ú": 0xfa, "ñ": 0xf1, "Ñ": 0xd1,
      "ü": 0xfc, "Ü": 0xdc, "º": 0xba, "ª": 0xaa
    };
    const bytes: number[] = [];
    for (const char of String(valor)) {
      const code = char.codePointAt(0) ?? 32;
      bytes.push(code <= 255 ? (mapa[char] ?? code) : 63);
    }
    return new Uint8Array(bytes);
  };

  const unirBytesPdf = (partes: Uint8Array[]) => {
    const total = partes.reduce((soma, parte) => soma + parte.length, 0);
    const resultado = new Uint8Array(total);
    let posicao = 0;
    for (const parte of partes) {
      resultado.set(parte, posicao);
      posicao += parte.length;
    }
    return resultado;
  };

  const objetoPdf = (numeroObjeto: number, corpo: Uint8Array) =>
    unirBytesPdf([bytesTextoPdf(`${numeroObjeto} 0 obj\n`), corpo, bytesTextoPdf("\nendobj\n")]);

  const escaparPdf = (valor: string) => String(valor ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const quebrarTextoPdf = (valor: string, maxChars = 86) => {
    const resultado: string[] = [];
    for (const paragrafo of String(valor ?? "").split(/\r?\n/)) {
      const palavras = paragrafo.split(/\s+/).filter(Boolean);
      if (!palavras.length) { resultado.push(""); continue; }
      let linha = "";
      for (const palavra of palavras) {
        const tentativa = linha ? `${linha} ${palavra}` : palavra;
        if (tentativa.length > maxChars && linha) {
          resultado.push(linha);
          linha = palavra;
        } else linha = tentativa;
      }
      if (linha) resultado.push(linha);
    }
    return resultado;
  };

  const prepararImagemPdf = (url: string, nome: string): Promise<PdfImagem | null> =>
    new Promise((resolve) => {
      if (!url) { resolve(null); return; }
      const imagem = new Image();
      imagem.onload = () => {
        try {
          const max = 900;
          const escala = Math.min(1, max / Math.max(imagem.naturalWidth || 1, imagem.naturalHeight || 1));
          const largura = Math.max(1, Math.round((imagem.naturalWidth || 1) * escala));
          const altura = Math.max(1, Math.round((imagem.naturalHeight || 1) * escala));
          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, largura, altura);
          ctx.drawImage(imagem, 0, 0, largura, altura);
          const jpeg = canvas.toDataURL("image/jpeg", 0.82);
          const base64 = jpeg.split(",")[1] || "";
          const binario = atob(base64);
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
          resolve({ bytes, largura, altura, nome });
        } catch {
          resolve(null);
        }
      };
      imagem.onerror = () => resolve(null);
      imagem.src = url;
    });

  const criarPdf = (paginas: PdfPagina[]) => {
    const totalPaginas = paginas.length || 1;
    const catalogoId = 1;
    const paginasId = 2;
    const fonteId = 3;
    const fonteNegritoId = 4;
    let proximoId = 5;
    const paginaIds: number[] = [];
    const conteudoIds: number[] = [];
    const imagemIdsPorPagina: number[][] = [];

    for (const pagina of paginas) {
      paginaIds.push(proximoId++);
      conteudoIds.push(proximoId++);
      const ids: number[] = [];
      for (let i = 0; i < pagina.imagens.length; i++) ids.push(proximoId++);
      imagemIdsPorPagina.push(ids);
    }

    const objetos: Uint8Array[] = [];
    objetos[catalogoId] = objetoPdf(catalogoId, bytesTextoPdf(`<< /Type /Catalog /Pages ${paginasId} 0 R >>`));
    objetos[paginasId] = objetoPdf(paginasId, bytesTextoPdf(`<< /Type /Pages /Kids [${paginaIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${totalPaginas} >>`));
    objetos[fonteId] = objetoPdf(fonteId, bytesTextoPdf("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    objetos[fonteNegritoId] = objetoPdf(fonteNegritoId, bytesTextoPdf("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

    paginas.forEach((pagina, indicePagina) => {
      const xobjects = imagemIdsPorPagina[indicePagina].map((id, i) => `/Im${i + 1} ${id} 0 R`).join(" ");
      const recursos = `<< /Font << /F1 ${fonteId} 0 R /F2 ${fonteNegritoId} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >>`;
      objetos[paginaIds[indicePagina]] = objetoPdf(paginaIds[indicePagina], bytesTextoPdf(`<< /Type /Page /Parent ${paginasId} 0 R /MediaBox [0 0 595 842] /Resources ${recursos} /Contents ${conteudoIds[indicePagina]} 0 R >>`));
      const dados = bytesTextoPdf(pagina.conteudo);
      objetos[conteudoIds[indicePagina]] = objetoPdf(conteudoIds[indicePagina], unirBytesPdf([bytesTextoPdf(`<< /Length ${dados.length} >>\nstream\n`), dados, bytesTextoPdf("\nendstream") ]));
      pagina.imagens.forEach((imagem, i) => {
        const id = imagemIdsPorPagina[indicePagina][i];
        objetos[id] = objetoPdf(id, unirBytesPdf([
          bytesTextoPdf(`<< /Type /XObject /Subtype /Image /Width ${imagem.largura} /Height ${imagem.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imagem.bytes.length} >>\nstream\n`),
          imagem.bytes,
          bytesTextoPdf("\nendstream")
        ]));
      });
    });

    const partes: Uint8Array[] = [bytesTextoPdf("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n")];
    const offsets: number[] = new Array(proximoId).fill(0);
    let deslocamento = partes[0].length;
    for (let id = 1; id < proximoId; id++) {
      offsets[id] = deslocamento;
      partes.push(objetos[id]);
      deslocamento += objetos[id].length;
    }
    const xref = deslocamento;
    partes.push(bytesTextoPdf(`xref\n0 ${proximoId}\n0000000000 65535 f \n${Array.from({ length: proximoId - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${proximoId} /Root ${catalogoId} 0 R >>\nstartxref\n${xref}\n%%EOF`));
    const partesBlob = partes.map((parte) => {
      const copia = new Uint8Array(parte.byteLength);
      copia.set(parte);
      return copia.buffer;
    });
    return new Blob(partesBlob, { type: "application/pdf" });
  };

  const linhaPdf = (texto: string, x: number, y: number, tamanho = 10, negrito = false) =>
    `0 0 0 rg\nBT /${negrito ? "F2" : "F1"} ${tamanho} Tf 0 Tr ${x} ${y} Td (${escaparPdf(texto)}) Tj ET\n`;

  const linhaPdfBranca = (texto: string, x: number, y: number, tamanho = 10, negrito = false) =>
    `1 1 1 rg\nBT /${negrito ? "F2" : "F1"} ${tamanho} Tf 0 Tr ${x} ${y} Td (${escaparPdf(texto)}) Tj ET\n`;

  const gerarPdfMateriais = async (idsSelecionados?: Array<number | string>) => {
    const filtroIds = idsSelecionados && idsSelecionados.length ? idsSelecionados.map(String) : null;
    const chavePdf = filtroIds ? "materiais-selecionados" : "materiais";
    setGerandoPdf(chavePdf);
    try {
      const W = 595;
      const M = 34;
      const azul = "0.08 0.30 0.56";
      const azulMuitoClaro = "0.965 0.98 0.995";
      const borda = "0.78 0.83 0.88";
      const rodape = 28;
      const materiaisBase = filtroIds
        ? materiais.filter((material) => filtroIds.includes(String(material.id)))
        : materiais;
      const materiaisOrdenados = materiaisBase.slice().sort((a, b) =>
        String(a.obra || "Sem obra").localeCompare(String(b.obra || "Sem obra"), "pt-BR", { sensitivity: "base" })
      );
      const total = materiaisOrdenados.reduce((soma, m) => soma + Number(m.quantidade || 0) * Number(m.valor || 0), 0);
      const totalItens = materiaisOrdenados.reduce((s, m) => s + Number(m.quantidade || 0), 0);
      const dataRelatorio = new Date().toLocaleDateString("pt-BR");

      const retangulo = (cor: string, x: number, y: number, w: number, h: number, raio = 0) => {
        if (raio > 0) {
          const k = 0.5522848 * raio;
          return `${cor} rg\n${x + raio} ${y} m ${x + w - raio} ${y} l ${x + w - raio + k} ${y} ${x + w} ${y + raio - k} ${x + w} ${y + raio} c ${x + w} ${y + h - raio} l ${x + w} ${y + h - raio + k} ${x + w - raio + k} ${y + h} ${x + w - raio} ${y + h} c ${x + raio} ${y + h} l ${x + raio - k} ${y + h} ${x} ${y + h - raio + k} ${x} ${y + h - raio} c ${x} ${y + raio} l ${x} ${y + raio - k} ${x + raio - k} ${y} ${x + raio} ${y} c f\n`;
        }
        return `${cor} rg ${x} ${y} ${w} ${h} re f\n`;
      };

      const cabecalho = (pagina: number) => {
        let c = "";
        c += retangulo(azulMuitoClaro, M, 758, W - M * 2, 58, 10);
        c += retangulo(azul, M, 758, 7, 58, 3);
        c += linhaPdf("CGL - Gerenciamento de Obras", M + 20, 793, 18, true);
        c += linhaPdf("LISTA DE MATERIAIS", M + 20, 773, 11, true);
        c += linhaPdf("Relatório de Materiais", M + 20, 759, 7.5, false);
        c += linhaPdf(`Página ${pagina}`, 505, 790, 7.5, true);
        c += linhaPdf(dataRelatorio, 505, 776, 7.5, false);
        c += `${azul} RG 1.2 w ${M} 748 m ${W - M} 748 l S\n`;
        return c;
      };

      const paginas: PdfPagina[] = [];
      let paginaNumero = 1;
      let c = cabecalho(paginaNumero);
      let y = 721;

      c += retangulo(azulMuitoClaro, M, y - 8, 360, 42, 7);
      c += linhaPdf("OBRAS DO RELATÓRIO", M + 14, y + 17, 7, true);
      const nomesObras = Array.from(new Set(materiaisOrdenados.map((m) => String(m.obra || "Sem obra"))));
      c += linhaPdf(nomesObras.length ? `${nomesObras.length} obra(s)` : "Nenhuma obra", M + 14, y + 3, 10, true);
      c += retangulo(azulMuitoClaro, 408, y - 8, W - M - 408, 42, 7);
      c += linhaPdf("DATA DO RELATÓRIO", 421, y + 17, 7, true);
      c += linhaPdf(dataRelatorio, 421, y + 3, 10, true);
      y -= 60;

      const cols = { no: M, material: M + 42, unidade: 300, qtd: 374, unit: 442, total: 510 };
      const tableW = W - M * 2;
      const rowH = 29;
      const drawTableHeader = () => {
        c += retangulo(azul, M, y - rowH + 4, tableW, rowH, 4);
        c += linhaPdfBranca("#", cols.no + 12, y - 14, 7.5, true);
        c += linhaPdfBranca("MATERIAL", cols.material + 8, y - 14, 7.5, true);
        c += linhaPdfBranca("UNIDADE", cols.unidade + 7, y - 14, 7.5, true);
        c += linhaPdfBranca("QUANT.", cols.qtd + 4, y - 14, 7.5, true);
        c += linhaPdfBranca("VALOR UNIT.", cols.unit + 2, y - 14, 7.5, true);
        c += linhaPdfBranca("TOTAL", cols.total + 2, y - 14, 7.5, true);
        y -= rowH;
      };

      const grupos = materiaisOrdenados.reduce((acc, item) => {
        const obra = String(item.obra || "Sem obra");
        const grupo = acc.find((g) => g.obra === obra);
        if (grupo) grupo.itens.push(item);
        else acc.push({ obra, itens: [item] });
        return acc;
      }, [] as Array<{ obra: string; itens: typeof materiais }>);

      let numeroItem = 1;
      for (const grupo of grupos) {
        const alturaObra = 30;
        if (y - alturaObra < 118) {
          c += linhaPdf(`CGL - Gerenciamento de Obras  |  Materiais  |  Página ${paginaNumero}`, M, rodape, 7, false);
          paginas.push({ conteudo: c, imagens: [] });
          paginaNumero += 1;
          c = cabecalho(paginaNumero);
          y = 721;
        }

        c += retangulo(azulMuitoClaro, M, y - alturaObra + 4, tableW, alturaObra, 6);
        c += linhaPdf("OBRA", M + 13, y - 8, 6.8, true);
        c += linhaPdf(grupo.obra, M + 13, y - 21, 9.5, true);
        y -= alturaObra + 7;

        drawTableHeader();

        for (const m of grupo.itens) {
          const nomeLinhas = quebrarTextoPdf(m.nome || "-", 28);
          const altura = Math.max(rowH, nomeLinhas.length * 10 + 15);
          if (y - altura < 118) {
            c += linhaPdf(`CGL - Gerenciamento de Obras  |  Materiais  |  Página ${paginaNumero}`, M, rodape, 7, false);
            paginas.push({ conteudo: c, imagens: [] });
            paginaNumero += 1;
            c = cabecalho(paginaNumero);
            y = 721;
            c += retangulo(azulMuitoClaro, M, y - alturaObra + 4, tableW, alturaObra, 6);
            c += linhaPdf("OBRA", M + 13, y - 8, 6.8, true);
            c += linhaPdf(grupo.obra, M + 13, y - 21, 9.5, true);
            y -= alturaObra + 7;
            drawTableHeader();
          }
          if (numeroItem % 2 === 1) c += retangulo(azulMuitoClaro, M, y - altura + 4, tableW, altura);
          c += linhaPdf(String(numeroItem), cols.no + 12, y - 14, 7.5, false);
          nomeLinhas.slice(0, 2).forEach((linha, i) => {
            c += linhaPdf(linha, cols.material + 8, y - 13 - i * 10, 8.5, i === 0);
          });
          c += linhaPdf(String(m.unidade || "-"), cols.unidade + 7, y - 14, 7.5, false);
          c += linhaPdf(String(m.quantidade ?? 0), cols.qtd + 8, y - 14, 7.5, false);
          c += linhaPdf(dinheiro(Number(m.valor || 0)), cols.unit + 2, y - 14, 7.5, false);
          c += linhaPdf(dinheiro(Number(m.quantidade || 0) * Number(m.valor || 0)), cols.total + 2, y - 14, 7.5, true);
          c += `${borda} RG 0.45 w ${M} ${y - altura + 4} m ${W - M} ${y - altura + 4} l S\n`;
          y -= altura;
          numeroItem += 1;
        }
        y -= 8;
      }

      if (y < 165) {
        c += linhaPdf(`CGL - Gerenciamento de Obras  |  Materiais  |  Página ${paginaNumero}`, M, rodape, 7, false);
        paginas.push({ conteudo: c, imagens: [] });
        paginaNumero += 1;
        c = cabecalho(paginaNumero);
        y = 721;
      }

      y -= 12;
      c += retangulo(azulMuitoClaro, M, y - 54, 310, 58, 8);
      c += linhaPdf("TOTAL DE ITENS", M + 16, y - 17, 7.5, true);
      c += linhaPdf(String(totalItens), M + 16, y - 40, 17, true);
      c += retangulo(azul, 357, y - 54, W - M - 357, 58, 8);
      c += linhaPdfBranca("VALOR TOTAL", 373, y - 17, 7.5, true);
      c += linhaPdfBranca(dinheiro(total), 373, y - 40, 15, true);
      c += retangulo(azulMuitoClaro, M, 52, W - M * 2, 32, 8);
      c += linhaPdf("Materiais organizados por obra para controle, planejamento e acompanhamento.", M + 12, 71, 7.2, false);
      c += linhaPdf(`CGL - Gerenciamento de Obras  |  Página ${paginaNumero}`, 394, 62, 6.8, true);
      paginas.push({ conteudo: c, imagens: [] });

      const blob = criarPdf(paginas);
      const url = URL.createObjectURL(blob);
      const nomePdf = filtroIds
        ? `CGL-Materiais-Selecionados-${hoje}.pdf`
        : `CGL-Materiais-${hoje}.pdf`;
      setPdfGerado((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.url);
        return { url, nome: nomePdf, tipo: "materiais" };
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = nomePdf;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setGerandoPdf(null);
    }
  };

  const gerarPdfDiario = async (idsSelecionados?: Array<number | string> | number | string) => {
    const idsArray = Array.isArray(idsSelecionados)
      ? idsSelecionados
      : idsSelecionados != null
        ? [idsSelecionados]
        : null;
    const filtroIds = idsArray && idsArray.length ? idsArray.map(String) : null;
    const chavePdf = filtroIds
      ? (filtroIds.length === 1 ? `diario-${filtroIds[0]}` : "diario-selecionados")
      : "diario";
    setGerandoPdf(chavePdf);
    try {
      const W = 595;
      const M = 34;
      const azul = "0.08 0.30 0.56";
      const azulMuitoClaro = "0.965 0.98 0.995";
      const dataFormatada = (data: string) => data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : "-";
      const retangulo = (cor: string, x: number, y: number, w: number, h: number, raio = 0) => {
        if (raio > 0) {
          const k = 0.5522848 * raio;
          return `${cor} rg\n${x + raio} ${y} m ${x + w - raio} ${y} l ${x + w - raio + k} ${y} ${x + w} ${y + raio - k} ${x + w} ${y + raio} c ${x + w} ${y + h - raio} l ${x + w} ${y + h - raio + k} ${x + w - raio + k} ${y + h} ${x + w - raio} ${y + h} c ${x + raio} ${y + h} l ${x + raio - k} ${y + h} ${x} ${y + h - raio + k} ${x} ${y + h - raio} c ${x} ${y + raio} l ${x} ${y + raio - k} ${x + raio - k} ${y} ${x + raio} ${y} c f\n`;
        }
        return `${cor} rg ${x} ${y} ${w} ${h} re f\n`;
      };
      const registros = diarioObra
        .filter((registro) => !filtroIds || filtroIds.includes(String(registro.id)))
        .slice()
        .sort((a, b) => {
          const obraCompare = String(a.obra || "Sem obra").localeCompare(String(b.obra || "Sem obra"), "pt-BR", { sensitivity: "base" });
          if (obraCompare !== 0) return obraCompare;
          return String(b.data).localeCompare(String(a.data));
        });
      const paginas: PdfPagina[] = [];

      if (!registros.length) {
        paginas.push({
          conteudo: linhaPdf("CGL - Gerenciamento de Obras", M, 790, 18, true) + linhaPdf("DIÁRIO DE OBRA", M, 765, 12, true) + linhaPdf("Nenhum registro cadastrado.", M, 730, 10, false),
          imagens: [],
        });
      } else {
        for (const registro of registros) {
          const imagens: PdfImagem[] = [];
          for (const foto of registro.fotos || []) {
            const imagem = await prepararImagemPdf(foto.url, foto.descricao || foto.nome);
            if (imagem) imagens.push(imagem);
          }

          let c = "";
          let y = 806;
          c += retangulo(azulMuitoClaro, M, 748, W - M * 2, 58, 10);
          c += retangulo(azul, M, 748, 7, 58, 3);
          c += linhaPdf("CGL - Gerenciamento de Obras", M + 20, 784, 18, true);
          c += linhaPdf("DIÁRIO DE OBRA", M + 20, 765, 11, true);
          c += linhaPdf("Relatório Diário", M + 20, 751, 7.5, false);
          c += `${azul} RG 1.2 w ${M} 738 m ${W - M} 738 l S\n`;
          y = 714;

          c += retangulo(azulMuitoClaro, M, y - 43, 360, 47, 7);
          c += linhaPdf("DATA", M + 13, y - 10, 6.8, true);
          c += linhaPdf(dataFormatada(registro.data), M + 13, y - 27, 9, true);
          c += linhaPdf("OBRA", M + 125, y - 10, 6.8, true);
          c += linhaPdf(registro.obra || "-", M + 125, y - 27, 9, true);
          c += linhaPdf("TÍTULO", M + 250, y - 10, 6.8, true);
          c += linhaPdf(registro.titulo || "-", M + 250, y - 27, 9, true);
          c += retangulo(azulMuitoClaro, 408, y - 43, W - M - 408, 47, 7);
          c += linhaPdf("ETAPA / SERVIÇO", 421, y - 10, 6.8, true);
          const etapa = quebrarTextoPdf(registro.etapa || "-", 22)[0];
          c += linhaPdf(etapa, 421, y - 27, 8.5, true);
          y -= 65;

          const secao = (titulo: string, altura: number) => {
            let s = retangulo(azul, M, y - altura, W - M * 2, altura, 7);
            s += linhaPdfBranca(titulo, M + 13, y - 16, 8.5, true);
            return s;
          };

          const descricao = quebrarTextoPdf(registro.descricao || "-", 94).slice(0, 7);
          const alturaDesc = Math.max(48, 30 + descricao.length * 11);
          c += secao("O QUE FOI FEITO", alturaDesc);
          descricao.forEach((linha, i) => {
            c += linhaPdfBranca(linha, M + 13, y - 34 - i * 11, 8.5, false);
          });
          y -= alturaDesc + 10;

          if (registro.observacao) {
            const obs = quebrarTextoPdf(registro.observacao, 94).slice(0, 6);
            const alturaObs = Math.max(48, 30 + obs.length * 11);
            c += secao("OBSERVAÇÕES", alturaObs);
            obs.forEach((linha, i) => {
              c += linhaPdfBranca(linha, M + 13, y - 34 - i * 11, 8.5, false);
            });
            y -= alturaObs + 10;
          }

          if (imagens.length) {
            c += retangulo(azul, M, y - 22, W - M * 2, 22, 7);
            c += linhaPdfBranca(`FOTOS DO DIA  •  ${imagens.length}`, M + 13, y - 15, 8.5, true);
            y -= 32;

            const colGap = 12;
            const fotoW = (W - M * 2 - colGap) / 2;
            const fotoHMax = 175;
            const fotoRowH = fotoHMax + 22;
            const maxRowsNaPagina = Math.max(1, Math.floor((y - 58) / fotoRowH));
            const totalRows = Math.ceil(imagens.length / 2);
            const primeiraPaginaRows = Math.min(totalRows, maxRowsNaPagina);

            const desenharFotos = (lote: PdfImagem[], inicioGlobal: number, tituloFotos: boolean) => {
              let cc = "";
              let yy = y;
              if (tituloFotos) {
                cc += retangulo(azul, M, yy - 22, W - M * 2, 22, 7);
                cc += linhaPdfBranca(`FOTOS DO DIA  •  ${imagens.length}`, M + 13, yy - 15, 8.5, true);
                yy -= 32;
              }
              lote.forEach((imagem, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                const escala = Math.min(fotoW / imagem.largura, fotoHMax / imagem.altura);
                const w = imagem.largura * escala;
                const h = imagem.altura * escala;
                const xBase = M + col * (fotoW + colGap);
                const x = xBase + (fotoW - w) / 2;
                const yImg = yy - row * fotoRowH - h;
                cc += retangulo(azulMuitoClaro, xBase, yImg - 18, fotoW, h + 18, 5);
                cc += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${yImg.toFixed(2)} cm /Im${i + 1} Do Q\n`;
                cc += linhaPdf(`Foto ${inicioGlobal + i + 1}`, xBase + 8, yImg - 12, 6.8, false);
              });
              return cc;
            };

            const primeira = imagens.slice(0, primeiraPaginaRows * 2);
            c += desenharFotos(primeira, 0, false);
            paginas.push({ conteudo: c + linhaPdf("CGL - Gerenciamento de Obras  |  Diário de Obra", M, 28, 7, false), imagens: primeira });

            let inicio = primeira.length;
            while (inicio < imagens.length) {
              const lote = imagens.slice(inicio, inicio + Math.max(2, maxRowsNaPagina * 2));
              let cp = "";
              cp += retangulo(azulMuitoClaro, M, 762, W - M * 2, 54, 9);
              cp += linhaPdf("CGL - Gerenciamento de Obras", M + 16, 792, 15, true);
              cp += linhaPdf("DIÁRIO DE OBRA  •  FOTOS", M + 16, 773, 9.5, true);
              cp += linhaPdf(`${registro.obra || "-"}  •  ${registro.titulo || "-"}`, 375, 783, 7.5, false);
              const oldY = y;
              y = 730;
              cp += desenharFotos(lote, inicio, false);
              y = oldY;
              paginas.push({ conteudo: cp + linhaPdf("CGL - Gerenciamento de Obras  |  Diário de Obra", M, 28, 7, false), imagens: lote });
              inicio += lote.length;
            }
          } else {
            c += retangulo(azulMuitoClaro, M, y - 38, W - M * 2, 38, 7);
            c += linhaPdf("FOTOS DO DIA", M + 13, y - 15, 8.5, true);
            c += linhaPdf("Nenhuma foto anexada a este registro.", M + 13, y - 29, 8, false);
            paginas.push({ conteudo: c + linhaPdf("CGL - Gerenciamento de Obras  |  Diário de Obra", M, 28, 7, false), imagens: [] });
          }
        }
      }

      const blob = criarPdf(paginas);
      const url = URL.createObjectURL(blob);
      const registroUnico = filtroIds && registros.length === 1 ? registros[0] : null;
      const nomeSeguro = (valor: string) =>
        String(valor || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50);
      const nomePdf = registroUnico
        ? `CGL-Diario-${nomeSeguro(registroUnico.data || hoje)}-${nomeSeguro(registroUnico.obra || "Obra")}.pdf`
        : filtroIds
          ? `CGL-Diario-${registros.length}-Dias-${hoje}.pdf`
          : `CGL-Diario-de-Obra-${hoje}.pdf`;

      setPdfGerado((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.url);
        return { url, nome: nomePdf, tipo: "diario" };
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = nomePdf;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setGerandoPdf(null);
    }
  };

  const compartilharPdf = async () => {
    if (!pdfGerado) return;
    try {
      const resposta = await fetch(pdfGerado.url);
      const blob = await resposta.blob();
      const arquivo = new File([blob], pdfGerado.nome, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [arquivo] }))) {
        await navigator.share({ title: pdfGerado.nome.replace(/\.pdf$/i, ""), files: [arquivo] });
      } else {
        window.open(pdfGerado.url, "_blank", "noopener,noreferrer");
        alert("Seu aparelho/navegador não oferece compartilhamento direto de arquivo. O PDF foi aberto para você compartilhar.");
      }
    } catch (erro) {
      if ((erro as DOMException)?.name !== "AbortError") console.error("Falha ao compartilhar PDF:", erro);
    }
  };

  const conteudoMateriais = (
    <>
      <Header />

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Materiais</h2>
            <p>Controle quantidade, unidade e custo.</p>
          </div>
          <div className="pdfAcoes">
            <button type="button" className="secondary pdfBtn" disabled={gerandoPdf === "materiais"} onClick={() => void gerarPdfMateriais()}>
              📄 {gerandoPdf === "materiais" ? "Gerando..." : "PDF"}
            </button>
            <button
              type="button"
              className="secondary pdfBtn"
              disabled={!materiaisSelecionadosPdf.length || gerandoPdf === "materiais-selecionados"}
              onClick={() => void gerarPdfMateriais(materiaisSelecionadosPdf)}
            >
              📑 {gerandoPdf === "materiais-selecionados" ? "Gerando..." : `PDF selecionados (${materiaisSelecionadosPdf.length})`}
            </button>
            {materiaisSelecionadosPdf.length > 0 && (
              <button type="button" className="secondary" onClick={() => setMateriaisSelecionadosPdf([])}>
                ✕ Limpar seleção
              </button>
            )}
            {pdfGerado?.tipo === "materiais" && <button type="button" className="primary pdfShareBtn" onClick={() => void compartilharPdf()}>↗ Compartilhar</button>}
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
                        <button
                          type="button"
                          className={materiaisSelecionadosPdf.some((id) => String(id) === String(material.id)) ? "primary" : "secondary"}
                          onClick={() => setMateriaisSelecionadosPdf((selecionados) =>
                            selecionados.some((id) => String(id) === String(material.id))
                              ? selecionados.filter((id) => String(id) !== String(material.id))
                              : [...selecionados, material.id]
                          )}
                        >
                          {materiaisSelecionadosPdf.some((id) => String(id) === String(material.id)) ? "✓ No PDF" : "➕ PDF"}
                        </button>
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
        <div className="panelHeader"><div><h2>Pagamentos</h2><p>Os pagamentos dos funcionários ficam aqui até você confirmar o pagamento.</p></div></div>
        {pagamentos.length === 0 ? <Empty texto="Nenhum pagamento pendente." /> : <div className="tableWrap mobileFriendlyTable"><table><thead><tr><th>Funcionário / descrição</th><th>Período</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>
          {pagamentos.map((pagamento) => {
            const funcionario = pagamento.funcionarioId ? pessoas.find((p) => p.id === pagamento.funcionarioId) : null;
            return <tr key={pagamento.id}>
              <td><strong>{funcionario?.nome || pagamento.descricao}</strong>{pagamento.origem === "diarias" && <div className="muted">{pagamento.diasTrabalhados || 0} {(pagamento.diasTrabalhados || 0) === 1 ? "dia" : "dias"} trabalhados</div>}</td>
              <td>{pagamento.origem === "diarias" && pagamento.semanaInicio && pagamento.semanaFim ? `${pagamento.semanaInicio.slice(8,10)}/${pagamento.semanaInicio.slice(5,7)}/${pagamento.semanaInicio.slice(0,4)} a ${pagamento.semanaFim.slice(8,10)}/${pagamento.semanaFim.slice(5,7)}/${pagamento.semanaFim.slice(0,4)}` : (pagamento.data || "-")}</td>
              <td><strong>{dinheiro(pagamento.valor)}</strong></td>
              <td>{pagamento.origem === "diarias" ? <button type="button" className="pagamentoStatusBtn pendente" onClick={() => alternarStatusPagamento(pagamento.id)}>✓ Marcar como pago</button> : <span className={`status ${pagamento.status === "Pago" ? "status-concluido" : "status-pendente"}`}>{pagamento.status}</span>}</td>
              <td><div className="mobileActionButtons">{pagamento.origem === "diarias" ? <button className="danger" onClick={() => excluir("pagamento", pagamento.id)}>🗑️ Apagar</button> : <><button className="secondary" onClick={() => editarPagamento(pagamento.id)}>✏️ Editar</button><button className="danger" onClick={() => excluir("pagamento", pagamento.id)}>🗑️ Apagar</button></>}</div></td>
            </tr>;
          })}
        </tbody></table></div>}
      </section>
      <section className="panel pagamentoHistoricoPanel">
        <button
          type="button"
          className={`arquivoPasta ${arquivoPagamentosAberto ? "aberta" : ""}`}
          onClick={() => setArquivoPagamentosAberto((aberto) => !aberto)}
          aria-expanded={arquivoPagamentosAberto}
        >
          <span className="pastaIcon">{arquivoPagamentosAberto ? "📂" : "📁"}</span>
          <span className="pastaTexto">
            <strong>Registro de pagamentos</strong>
            <small>{registrosPagamentos.length} {registrosPagamentos.length === 1 ? "pagamento arquivado" : "pagamentos arquivados"}</small>
          </span>
          <span className="pastaSeta">{arquivoPagamentosAberto ? "⌃" : "⌄"}</span>
        </button>

        {arquivoPagamentosAberto && (
          <div className="arquivoPastaConteudo">
            <div className="arquivoCabecalho">
              <div>
                <strong>📂 Pagamentos dos funcionários</strong>
                <span>Todos os pagamentos já confirmados ficam guardados aqui.</span>
              </div>
              <div className="registroPagamentoBadge">{registrosPagamentos.length} {registrosPagamentos.length === 1 ? "registro" : "registros"}</div>
            </div>

            {registrosPagamentos.length === 0 ? (
              <div className="registroPagamentoEmpty">
                📁 Nenhum pagamento arquivado ainda.
                <span>Ao marcar um funcionário como pago, o registro aparecerá nesta pasta.</span>
              </div>
            ) : (
              <div className="registroPagamentosGrid">
                {registrosPagamentos.map((r) => (
                  <article className="registroPagamentoCard" key={r.id}>
                    <div className="registroPagamentoIcon">✓</div>
                    <div className="registroPagamentoInfo">
                      <strong>{r.nomeFuncionario}</strong>
                      <span>{r.diasTrabalhados} {r.diasTrabalhados === 1 ? "dia trabalhado" : "dias trabalhados"}</span>
                      <span>Período: {r.semanaInicio ? `${r.semanaInicio.slice(8,10)}/${r.semanaInicio.slice(5,7)}/${r.semanaInicio.slice(0,4)} a ${r.semanaFim.slice(8,10)}/${r.semanaFim.slice(5,7)}/${r.semanaFim.slice(0,4)}` : "-"}</span>
                      <small>Pago em {r.dataPagamento ? `${r.dataPagamento.slice(8,10)}/${r.dataPagamento.slice(5,7)}/${r.dataPagamento.slice(0,4)}` : "-"}</small>
                    </div>
                    <div className="registroPagamentoAcoes">
                      <strong className="registroPagamentoValor">{dinheiro(r.valor)}</strong>
                      <button
                        type="button"
                        className="secondary registroVoltarBtn"
                        onClick={() => void voltarPagamentoParaPendentes(r.id)}
                      >
                        ↩️ Voltar para pagamentos
                      </button>
                      <button
                        type="button"
                        className="danger registroApagarBtn"
                        onClick={() => void excluirRegistroPagamento(r.id)}
                      >
                        🗑️ Apagar registro
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );

  const conteudoDiarioObra = (
    <>
      <Header />
      <section className="panel diarioPanel">
        <div className="panelHeader diarioHeader">
          <div>
            <h2>📔 Diário de Obra</h2>
            <p>Registre o que aconteceu em cada dia da obra, com descrição, etapa e fotos.</p>
          </div>
          <div className="diarioHeaderAcoes">
            <div className="diarioResumo">
              <strong>{diarioObra.length}</strong>
              <span>{diarioObra.length === 1 ? "registro" : "registros"}</span>
            </div>
            <div className="pdfAcoes">
              <button type="button" className="secondary pdfBtn" disabled={gerandoPdf === "diario"} onClick={() => void gerarPdfDiario()}>📄 {gerandoPdf === "diario" ? "Gerando..." : "PDF"}</button>
            <button
              type="button"
              className="secondary pdfBtn"
              disabled={!diariosSelecionadosPdf.length || gerandoPdf === "diario-selecionados"}
              onClick={() => void gerarPdfDiario(diariosSelecionadosPdf)}
            >
              📑 {gerandoPdf === "diario-selecionados" ? "Gerando..." : `PDF selecionados (${diariosSelecionadosPdf.length})`}
            </button>
            {diariosSelecionadosPdf.length > 0 && (
              <button type="button" className="secondary" onClick={() => setDiariosSelecionadosPdf([])}>
                ✕ Limpar seleção
              </button>
            )}
              {pdfGerado?.tipo === "diario" && <button type="button" className="primary pdfShareBtn" onClick={() => void compartilharPdf()}>↗ Compartilhar</button>}
            </div>
          </div>
        </div>

        {diarioObra.length === 0 ? (
          <div className="diarioEmpty">
            <div className="diarioEmptyIcon">📔</div>
            <strong>Nenhum dia registrado ainda.</strong>
            <span>Use “+ Adicionar” para registrar o primeiro dia da obra.</span>
          </div>
        ) : (
          <div className="diarioLista">
            {diarioObra.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).map((registro) => (
              <article className="diarioCard" key={registro.id}>
                <div className="diarioCardTop">
                  <div>
                    <div className="diarioData">📅 {registro.data ? `${registro.data.slice(8,10)}/${registro.data.slice(5,7)}/${registro.data.slice(0,4)}` : "-"}</div>
                    <h3>{registro.titulo}</h3>
                    <div className="diarioObraTag">🏗️ {registro.obra}</div>
                  </div>
                  <div className="diarioAcoes">
                    <button
                      type="button"
                      className={diariosSelecionadosPdf.some((id) => String(id) === String(registro.id)) ? "primary" : "secondary"}
                      onClick={() => setDiariosSelecionadosPdf((selecionados) =>
                        selecionados.some((id) => String(id) === String(registro.id))
                          ? selecionados.filter((id) => String(id) !== String(registro.id))
                          : [...selecionados, registro.id]
                      )}
                    >
                      {diariosSelecionadosPdf.some((id) => String(id) === String(registro.id)) ? "✓ No PDF" : "➕ PDF"}
                    </button>
                    <button
                      type="button"
                      className="secondary pdfBtn"
                      disabled={gerandoPdf === `diario-${registro.id}`}
                      onClick={() => void gerarPdfDiario(registro.id)}
                    >
                      📄 {gerandoPdf === `diario-${registro.id}` ? "Gerando..." : "PDF do dia"}
                    </button>
                    <button type="button" className="secondary" onClick={() => editarDiarioObra(registro.id)}>✏️ Editar</button>
                    <button type="button" className="danger" onClick={() => excluir("diario", registro.id)}>🗑️ Excluir</button>
                  </div>
                </div>
                {registro.etapa && <div className="diarioEtapa"><strong>Etapa:</strong> {registro.etapa}</div>}
                <div className="diarioDescricao"><strong>O que foi feito</strong><p>{registro.descricao}</p></div>
                {registro.observacao && <div className="diarioObservacao"><strong>Observações</strong><p>{registro.observacao}</p></div>}
                {registro.fotos?.length > 0 && (
                  <div className="diarioFotos">
                    {registro.fotos.map((foto) => (
                      <div className="diarioFotoCard" key={foto.id}>
                        <img src={foto.url} alt={foto.descricao || foto.nome || "Foto do diário"} />
                        {foto.descricao && <div className="diarioFotoLegenda">{foto.descricao}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
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
          <div className="tableWrap toolMobileTable">
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
  if (aba === "Diário de Obra")
    conteudo = conteudoDiarioObra;

  return (
    <>
      <style>{estilos}</style>

      <div className="app" style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}>
        <aside className="sidebar">
          <div className="logo">
            <div className="logoMark">🏗️</div>
            <div className="logoText"><h1>CGL</h1><span>Gerenciamento de Obras</span></div>
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
              label="Recebido"
              value={obraForm.recebido}
              placeholder="0,00"
              inputMode="decimal"
              onChange={(v) =>
                setObraForm((f) => ({
                  ...f,
                  recebido: v,
                }))
              }
            />

            <div className="field">
              <span>A receber</span>
              <div className="inputLike">
                {dinheiro(Math.max(0, numero(obraForm.orcamento) - numero(obraForm.recebido)))}
              </div>
            </div>

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
              label="CPF"
              value={pessoaForm.cpf}
              placeholder="000.000.000-00"
              inputMode="numeric"
              onChange={(v) =>
                setPessoaForm((f) => ({ ...f, cpf: v }))
              }
            />

            <Campo
              label="Endereço"
              value={pessoaForm.endereco}
              placeholder="Rua, número, bairro..."
              onChange={(v) =>
                setPessoaForm((f) => ({ ...f, endereco: v }))
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
              type="button"
              onClick={() => void adicionarPessoa()}
            >
              {pessoaEditandoId === null ? "Salvar funcionário" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "gerenciarPessoa" && pessoaGerenciando && (
        <Modal
          titulo={`📅 ${pessoaGerenciando.nome} • Dias trabalhados`}
          fechar={() => { setModal(null); setPessoaGerenciandoId(null); }}
          largura={760}
        >
          <div className="formGrid">
            <Campo
              label="Valor da diária"
              value={pessoaGerenciamento.diaria}
              placeholder="Ex.: 80,00"
              inputMode="decimal"
              onChange={(v) => setPessoaGerenciamento((f) => ({ ...f, diaria: v }))}
            />
            <Campo
              label="Chave Pix"
              value={pessoaGerenciamento.pix}
              placeholder="Digite a chave Pix"
              onChange={(v) => setPessoaGerenciamento((f) => ({ ...f, pix: v }))}
            />
          </div>

          {semanasPessoa.map((semana, indiceSemana) => (
            <div className="semanaPessoaBloco" key={`semana-${indiceSemana}`}>
              <div className="sectionTitle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>🗓️ Domingo a sábado • {semana[0].data} a {semana[6].data}</span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9db1c5", fontWeight: 700 }}>
                  Início da semana
                  <input
                    type="date"
                    value={semana[0].chave}
                    onChange={(e) => alterarInicioSemanaPessoa(indiceSemana, e.target.value)}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 8,
                      border: "1px solid #2a4862",
                      background: "#0b1929",
                      color: "#eef5fb",
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                    aria-label={`Alterar início da semana ${indiceSemana + 1}`}
                  />
                </label>
              </div>

              <div className="diasSemanaGrid">
                {semana.map((dia) => {
                  const trabalhou = !!pessoaGerenciamento.diasTrabalhados[dia.chave];
                  return (
                    <button
                      key={dia.chave}
                      type="button"
                      className={`diaTrabalho ${trabalhou ? "trabalhou" : "naoTrabalhou"}`}
                      onClick={() => alternarDiaPessoa(dia.chave)}
                    >
                      <strong>{dia.nome}</strong>
                      <span>{dia.data}</span>
                      <b>{trabalhou ? "✓ Trabalhou" : "— Não trabalhou"}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="secondary adicionarSemanaPessoa"
            onClick={() => {
              const ultima = semanasPessoaInicios.length > 0
                ? new Date(`${semanasPessoaInicios[semanasPessoaInicios.length - 1]}T00:00:00`)
                : new Date(`${gerarSemanaPessoa(0)[0].chave}T00:00:00`);
              ultima.setDate(ultima.getDate() + 7);
              const novaSemana = `${ultima.getFullYear()}-${String(ultima.getMonth() + 1).padStart(2, "0")}-${String(ultima.getDate()).padStart(2, "0")}`;
              if (!semanasPessoaInicios.includes(novaSemana)) {
                setSemanasPessoaInicios((atuais) => [...atuais, novaSemana]);
                setSemanasPessoaVisiveis((q) => q + 1);
              }
            }}
          >
            ➕ Adicionar mais uma semana
          </button>

          <div className="resumoDiarias">
            <div><span>Dias trabalhados</span><strong>{diasTrabalhadosSemana}</strong></div>
            <div><span>Valor da diária</span><strong>{dinheiro(numero(pessoaGerenciamento.diaria))}</strong></div>
            <div><span>Total a pagar</span><strong>{dinheiro(totalPagarSemana)}</strong></div>
          </div>

          <div className="formActions">
            <button className="cancel" onClick={() => { setModal(null); setPessoaGerenciandoId(null); }}>Cancelar</button>
            <button className="primary" onClick={salvarGerenciamentoPessoa}>Salvar gerenciamento</button>
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
              <strong>Início:</strong>{" "}
              {obraAtual.inicio || "-"}
            </p>

            <p>
              <strong>Orçamento:</strong>{" "}
              {dinheiro(obraAtual.orcamento)}
            </p>

            <p>
              <strong>Recebido:</strong>{" "}
              {dinheiro(obraAtual.recebido || 0)}
            </p>

            <p>
              <strong>A receber:</strong>{" "}
              {dinheiro(Math.max(0, Number(obraAtual.orcamento || 0) - Number(obraAtual.recebido || 0)))}
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

                      {pessoa.cpf && (
                        <div className="funcionarioInfo">
                          🪪 CPF: {pessoa.cpf}
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

      {modal === "diarioObra" && (
        <Modal
          titulo={diarioEditandoId === null ? "📔 Novo registro do diário" : "📔 Editar registro do diário"}
          fechar={() => setModal(null)}
          largura={820}
        >
          <div className="formGrid diarioFormGrid">
            <label className="field">
              <span>Obra</span>
              <select value={diarioForm.obra} onChange={(e) => setDiarioForm((f) => ({ ...f, obra: e.target.value }))}>
                <option value="">Selecione a obra</option>
                {obras.map((obra) => <option key={obra.id} value={obra.nome}>{obra.nome}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Data do dia</span>
              <input type="date" value={diarioForm.data} onChange={(e) => setDiarioForm((f) => ({ ...f, data: e.target.value }))} />
            </label>
            <Campo label="Título do registro" required value={diarioForm.titulo} placeholder="Ex.: Parede lateral concluída" onChange={(v) => setDiarioForm((f) => ({ ...f, titulo: v }))} />
            <Campo label="Etapa / serviço" value={diarioForm.etapa} placeholder="Ex.: Alvenaria" onChange={(v) => setDiarioForm((f) => ({ ...f, etapa: v }))} />
            <label className="field full">
              <span>Descrição do que foi feito</span>
              <textarea rows={5} value={diarioForm.descricao} placeholder="Descreva com detalhes o serviço realizado no dia..." onChange={(e) => setDiarioForm((f) => ({ ...f, descricao: e.target.value }))} />
            </label>
            <label className="field full">
              <span>Observações</span>
              <textarea rows={3} value={diarioForm.observacao} placeholder="Ex.: serviço executado sem intercorrências..." onChange={(e) => setDiarioForm((f) => ({ ...f, observacao: e.target.value }))} />
            </label>
            <div className="diarioFotoEditor full">
              <div className="diarioFotoEditorHeader">
                <div><strong>📸 Fotos do dia</strong><span>Registre visualmente o andamento deste serviço.</span></div>
                <div className="photoActions">
                  <button type="button" className="secondary" onClick={() => diarioCameraInputRef.current?.click()}>📷 Tirar foto</button>
                  <button type="button" className="secondary" onClick={() => diarioGaleriaInputRef.current?.click()}>🖼️ Galeria</button>
                  <input ref={diarioCameraInputRef} type="file" accept="image/*" capture="environment" onChange={adicionarFotoDiario} style={{display:"none"}} />
                  <input ref={diarioGaleriaInputRef} type="file" accept="image/*" onChange={adicionarFotoDiario} style={{display:"none"}} />
                </div>
              </div>
              <Campo label="Descrição da foto" value={diarioFotoDescricao} placeholder="Ex.: Parede direita após a execução" onChange={setDiarioFotoDescricao} />
              <div className="diarioFotoListaEditor">
                {(diarioEditandoId === null ? diarioFotosRascunho : (diarioObra.find((item) => item.id === diarioEditandoId)?.fotos || [])).length === 0 ? (
                  <div className="diarioFotoAviso">Nenhuma foto adicionada ainda.</div>
                ) : (
                  (diarioEditandoId === null ? diarioFotosRascunho : (diarioObra.find((item) => item.id === diarioEditandoId)?.fotos || [])).map((foto) => (
                    <div className="diarioFotoEditorCard" key={foto.id}>
                      <img src={foto.url} alt={foto.descricao || foto.nome || "Foto"} />
                      {foto.descricao && <div className="diarioFotoLegenda">{foto.descricao}</div>}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => diarioEditandoId === null ? excluirFotoDiarioRascunho(foto.id) : excluirFotoDiario(diarioEditandoId, foto.id)}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="formActions">
            <button className="cancel" type="button" onClick={() => setModal(null)}>Cancelar</button>
            <button className="primary" type="button" onClick={salvarDiarioObra}>{diarioEditandoId === null ? "Salvar registro" : "Salvar alterações"}</button>
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
              <div style={{marginTop:12,padding:12,borderRadius:10,background:"#fff0f3",border:"1px solid #f7ccd6",color:"#d85c78",fontSize:11,textAlign:"left",wordBreak:"break-word"}}>
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
