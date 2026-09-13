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
  foto?: string;
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
.logo{display:flex;align-items:center;gap:11px;padding:4px 10px 24px;border-bottom:1px solid #172b42}.logoMark{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#1686ff,#2bc7ff);box-shadow:0 0 24px rgba(35,136,255,.35);font-size:22px}
.logoMarkImagem{overflow:hidden!important;padding:0!important;background:#ffffff!important;border:1px solid #e2ebf4!important;border-radius:12px!important;box-shadow:0 5px 18px rgba(36,59,83,.10)!important}
.logoMarkImagem img{width:100%;height:100%;display:block;object-fit:contain;border-radius:10px}
.logo h1{margin:0;font-size:20px;letter-spacing:-.4px}.logo span{display:block;color:#71849a;font-size:10px;margin-top:2px}.nav{display:flex;flex-direction:column;gap:6px;padding-top:18px;overflow:auto}.nav button{height:45px;width:100%;border:1px solid transparent;background:transparent;color:#8ea1b7;border-radius:11px;display:flex;align-items:center;gap:12px;padding:0 12px;font-size:13px;text-align:left;transition:.2s}.nav button:hover{background:#0d1e31;color:#eaf2fb}.nav button.active{background:linear-gradient(90deg,rgba(31,132,255,.22),rgba(31,132,255,.08));border-color:#155ea8;color:#fff;box-shadow:inset 3px 0 0 #2388ff}.navIcon{width:20px;height:20px;display:grid;place-items:center;color:currentColor}.navLabel{white-space:nowrap}.sidebarFooter{margin-top:auto;border-top:1px solid #172b42;padding:15px 8px 0;display:flex;align-items:center;gap:10px}.avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#1e88ff,#7c3aed);font-size:12px;font-weight:800}.sidebarFooter strong{font-size:12px}.sidebarFooter span{display:block;color:#71849a;font-size:10px;margin-top:2px}
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
/* =========================================================
   FUNCIONÁRIOS — MODELO 2
   Somente aparência: mantém as funções e ações existentes.
   ========================================================= */
.funcionariosPanel{
  background:#ffffff!important;
  border:1px solid #dce7f2!important;
  box-shadow:0 8px 28px rgba(36,59,83,.07)!important;
  color:#243b53!important;
}
.funcionariosTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:18px;
}
.funcionariosTitulo{
  display:flex;
  align-items:center;
  gap:12px;
}
.funcionariosTituloIcon{
  width:44px;
  height:44px;
  display:grid;
  place-items:center;
  border-radius:13px;
  background:#eaf4ff;
  border:1px solid #cfe5f8;
  color:#167fe8;
  font-size:21px;
}
.funcionariosTitulo h2{
  margin:0 0 3px;
  color:#243b53!important;
  font-size:18px;
  font-weight:850;
}
.funcionariosTitulo p{
  margin:0;
  color:#718399!important;
  font-size:11px;
}
.funcionariosGrid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:13px;
}
.funcionarioCard{
  min-width:0;
  padding:15px;
  border:1px solid #dce7f2;
  border-radius:15px;
  background:#ffffff;
  box-shadow:0 6px 18px rgba(36,59,83,.055);
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
}
.funcionarioCard:hover{
  transform:translateY(-2px);
  border-color:#b9d8ef;
  box-shadow:0 10px 25px rgba(36,59,83,.09);
}
.funcionarioCardHeader{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
}
.funcionarioAvatar{
  width:54px;
  height:54px;
  flex:0 0 54px;
  border-radius:50%;
  display:grid;
  place-items:center;
  font-size:15px;
  font-weight:900;
  border:3px solid #fff;
  box-shadow:0 3px 12px rgba(36,59,83,.12);
}
.funcionarioAvatar.azul{background:#dceeff;color:#167fe8}
.funcionarioAvatarFoto{object-fit:cover;background:#f1f5f9}
.funcionarioAvatar.verde{background:#def8eb;color:#14966b}
.funcionarioAvatar.roxo{background:#eee5ff;color:#7651c8}
.funcionarioAvatar.laranja{background:#fff0d8;color:#c57919}
.funcionarioIdentidade{
  min-width:0;
  flex:1;
}
.funcionarioIdentidade h3{
  margin:0 0 4px;
  color:#243b53!important;
  font-size:13px;
  font-weight:850;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.funcionarioIdentidade span{
  display:block;
  color:#718399!important;
  font-size:10px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.funcionarioStatus{
  flex:0 0 auto;
  padding:5px 8px;
  border-radius:999px;
  font-size:9px;
  font-weight:850;
}
.funcionarioStatus.ativo{
  background:#def8eb;
  border:1px solid #bdebd7;
  color:#15966b;
}
.funcionarioStatus.disponivel{
  background:#f1f5f9;
  border:1px solid #d9e2ec;
  color:#5f7185;
}
.funcionarioCardInfo{
  display:flex;
  flex-direction:column;
  gap:8px;
  margin-top:15px;
}
.funcionarioInfoLinha{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  color:#536b82;
  font-size:10px;
}
.funcionarioInfoLinha>span:last-child,
.funcionarioInfoLinha>strong{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.funcionarioInfoLinha strong{
  color:#243b53!important;
  font-size:11px;
}
.funcionarioInfoLinha small{
  color:#718399;
  font-size:9px;
  font-weight:700;
}
.funcionarioInfoIcon{
  width:25px;
  height:25px;
  flex:0 0 25px;
  display:grid;
  place-items:center;
  border-radius:8px;
  background:#f1f7fc;
  border:1px solid #dceaf5;
  color:#168fe9;
  font-size:10px;
  font-weight:900;
}
.funcionarioCardDivider{
  height:1px;
  background:#edf2f6;
  margin:14px 0 11px;
}
.funcionarioCardActions{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);
  gap:6px;
}
.funcionarioCardActions button,
.funcionarioPixBtn{
  min-height:34px;
  border-radius:9px;
  font-size:9px;
  font-weight:850;
  transition:.16s;
}
.funcionarioVerBtn{
  border:1px solid #dce7f2;
  background:#f5f9fc;
  color:#3d5870;
  padding:7px 8px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.funcionarioVerBtn:hover{
  background:#eaf4fb;
  border-color:#c8ddeb;
}
.funcionarioEditBtn{
  border:1px solid #168fe9;
  background:#168fe9;
  color:#fff;
  padding:7px 11px;
  white-space:nowrap;
}
.funcionarioEditBtn:hover{
  background:#087bd4;
}
.funcionarioDeleteBtn{
  width:100%;
  min-height:34px;
  padding:7px 11px;
  border:1px solid #f2c8d0;
  border-radius:9px;
  background:#fff5f6;
  color:#d34e67;
  font-size:9px;
  font-weight:850;
  white-space:nowrap;
}
.funcionarioDeleteDesktop{
  display:inline;
}
.funcionarioDeleteMobile{
  display:none;
}
.funcionarioDeleteBtn:hover{
  background:#ffeaed;
}
.funcionarioPixBtn{
  width:100%;
  margin-top:8px;
  padding:7px 10px;
  border:1px solid #bfe3f3;
  background:#eef9ff;
  color:#147fa8;
}
.funcionarioPixBtn:hover{
  background:#e1f5ff;
}
.funcionarioCpf{
  margin-top:9px;
  color:#8a9bad;
  font-size:9px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.funcionarioCpf strong{
  color:#536b82;
}
.funcionarioFotoEditor{
  display:flex;
  align-items:center;
  gap:13px;
  padding:12px 0 16px;
  margin-bottom:4px;
  border-bottom:1px solid #edf2f6;
}
.funcionarioFotoBotao{
  position:relative;
  width:76px;
  height:76px;
  flex:0 0 76px;
  padding:0;
  border:3px solid #dce7f2;
  border-radius:50%;
  overflow:visible;
  background:#eef6ff;
  color:#167fe8;
  display:grid;
  place-items:center;
  cursor:pointer;
  box-shadow:0 4px 14px rgba(36,59,83,.10);
}
.funcionarioFotoBotao>img{
  width:100%;
  height:100%;
  object-fit:cover;
  border-radius:50%;
  display:block;
}
.funcionarioFotoBotao>span:first-child{
  font-size:27px;
}
.funcionarioFotoCamera{
  position:absolute;
  right:-2px;
  bottom:-2px;
  width:25px;
  height:25px;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#168fe9;
  border:2px solid #fff;
  font-size:11px;
}
.funcionarioFotoEditor strong{
  display:block;
  color:#243b53;
  font-size:12px;
}
.funcionarioFotoEditor small{
  display:block;
  margin-top:4px;
  color:#718399;
  font-size:10px;
}
@media(max-width:1100px){
  .funcionariosGrid{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}
@media(max-width:850px){
  .funcionariosGrid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
@media(max-width:650px){
  .funcionariosPanel{
    padding:13px!important;
  }
  .funcionariosTop{
    margin-bottom:13px;
  }
  .funcionariosTituloIcon{
    width:40px;
    height:40px;
    border-radius:11px;
  }
  .funcionariosTitulo h2{
    font-size:16px;
  }
  .funcionariosTitulo p{
    font-size:10px;
  }
  .funcionariosGrid{
    grid-template-columns:1fr;
    gap:10px;
  }
  .funcionarioCard{
    padding:13px;
    border-radius:13px;
  }
  .funcionarioAvatar{
    width:48px;
    height:48px;
    flex-basis:48px;
  }
  .funcionarioCardActions{
    grid-template-columns:minmax(0,1fr) auto auto;
  }
  .funcionarioCardActions button{
    min-height:36px;
  }
  .funcionarioDeleteBtn{
    width:35px;
    padding:0;
  }
  .funcionarioDeleteDesktop{
    display:none;
  }
  .funcionarioDeleteMobile{
    display:inline;
  }
}
@media(min-width:651px) and (max-width:1050px){
  .funcionarioCardActions{
    grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);
  }
}
/* TAREFAS — MODELO 2: cards claros e responsivos */
.tarefasModelo2Panel{
  padding:18px;
  border:1px solid #dfe7ef;
  border-radius:18px;
  background:#ffffff;
  box-shadow:0 8px 26px rgba(31,64,96,.07);
}
.tarefasModelo2Top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin-bottom:16px;
}
.tarefasModelo2Titulo{display:flex;align-items:center;gap:12px;min-width:0}
.tarefasModelo2Icon{
  width:44px;height:44px;display:grid;place-items:center;
  border-radius:12px;background:#eaf3ff;color:#1677df;
  border:1px solid #d8eaff;font-size:22px;font-weight:900;
}
.tarefasModelo2Titulo h2{margin:0;color:#172433;font-size:20px;line-height:1.15}
.tarefasModelo2Titulo p{margin:4px 0 0;color:#718096;font-size:11px}
.tarefasModelo2Novo{
  border:0;border-radius:9px;background:#1677df;color:#fff;
  padding:10px 15px;font-size:11px;font-weight:850;cursor:pointer;
  box-shadow:0 4px 10px rgba(22,119,223,.16);
}
.tarefasModelo2Novo:hover{filter:brightness(1.04)}
.tarefasModelo2Resumo{
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
  gap:10px;margin-bottom:15px;
}
.tarefasResumoCard{
  display:flex;align-items:center;gap:10px;min-width:0;
  padding:10px 12px;border:1px solid #e1e8ef;border-radius:11px;background:#fff;
}
.tarefasResumoIcon{
  width:34px;height:34px;display:grid;place-items:center;border-radius:10px;
  background:#edf5ff;color:#1677df;font-size:15px;font-weight:900;
}
.tarefasResumoIcon.pendente{background:#fff7df;color:#e7a400}
.tarefasResumoIcon.andamento{background:#edf6ff;color:#2587e8}
.tarefasResumoIcon.concluida{background:#eaf9f0;color:#1aa35a}
.tarefasResumoCard strong{display:block;color:#182534;font-size:16px;line-height:1}
.tarefasResumoCard small{display:block;margin-top:4px;color:#748196;font-size:9px}
.tarefasModelo2Grid{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;
}
.tarefaModelo2Card{
  position:relative;min-width:0;padding:14px;border:1px solid #dfe7ef;
  border-radius:13px;background:#fff;box-shadow:0 4px 13px rgba(30,60,90,.045);
}
.tarefaModelo2Cabecalho{
  display:flex;justify-content:space-between;gap:8px;min-height:47px;
}
.tarefaModelo2Cabecalho h3{
  margin:0;color:#182534;font-size:13px;line-height:1.3;
  overflow-wrap:anywhere;padding-right:2px;
}
.tarefaModelo2Cabecalho span:not(.tarefaModelo2Menu){
  display:block;margin-top:5px;color:#68778a;font-size:9px;line-height:1.25;
}
.tarefaModelo2Menu{
  color:#6d7d90;font-size:18px;line-height:18px;flex:0 0 auto;
}
.tarefaModelo2Progresso{margin-top:10px}
.tarefaModelo2ProgressoTopo{
  display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;
  color:#68778a;font-size:9px;
}
.tarefaModelo2ProgressoTopo strong{color:#1677df;font-size:11px}
.tarefaModelo2Barra{height:7px;border-radius:99px;background:#e9eef3;overflow:hidden}
.tarefaModelo2Barra div{
  height:100%;border-radius:99px;background:linear-gradient(90deg,#1686ed,#38a4ff);
  transition:width .25s ease;
}
.tarefaModelo2Info{
  display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;
  color:#667589;font-size:9px;
}
.tarefaModelo2Info span{min-width:0;overflow-wrap:anywhere}
.tarefaModelo2Controles{
  display:grid;grid-template-columns:repeat(2,1fr) 52px repeat(2,1fr);
  gap:4px;margin-top:10px;
}
.tarefaModelo2Controles button,.tarefaModelo2Controles input{
  height:28px;border-radius:7px;border:1px solid #dce5ee;
  background:#f7fafc;color:#547087;font-size:8px;font-weight:800;text-align:center;
}
.tarefaModelo2Controles input{background:#fff;color:#172433;font-size:10px;outline:none;width:100%}
.tarefaModelo2Controles input:focus{border-color:#4c9bed;box-shadow:0 0 0 2px rgba(76,155,237,.12)}
.tarefaModelo2Rodape{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;
  gap:5px;margin-top:10px;padding-top:10px;border-top:1px solid #edf1f5;
}
.tarefaModelo2Rodape .status{
  min-width:0;width:100%;padding:7px 8px;border:1px solid #e0e7ee;
  background:#f7fafc;color:#52677c;
}
.tarefaModelo2Editar,.tarefaModelo2Excluir{
  min-width:0;border-radius:8px;font-size:9px;font-weight:850;cursor:pointer;
}
.tarefaModelo2Editar{border:1px solid #d5e8fb;background:#edf6ff;color:#1677df}
.tarefaModelo2Excluir{border:1px solid #f3d7dc;background:#fff6f7;color:#d14b5e}
.tarefasModelo2Empty{
  min-height:230px;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:7px;color:#718096;text-align:center;
  border:1px dashed #d8e1ea;border-radius:13px;background:#fbfcfd;
}
.tarefasModelo2Empty div{font-size:28px;color:#1677df}
.tarefasModelo2Empty strong{color:#263647;font-size:13px}
.tarefasModelo2Empty span{font-size:10px}
@media(max-width:1050px){
  .tarefasModelo2Grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:700px){
  .tarefasModelo2Panel{padding:12px;border-radius:14px}
  .tarefasModelo2Top{align-items:flex-start;margin-bottom:12px}
  .tarefasModelo2Titulo h2{font-size:17px}
  .tarefasModelo2Titulo p{font-size:9px}
  .tarefasModelo2Icon{width:38px;height:38px;font-size:18px}
  .tarefasModelo2Novo{padding:9px 11px;font-size:10px}
  .tarefasModelo2Resumo{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .tarefasResumoCard{padding:8px 9px}
  .tarefasResumoIcon{width:30px;height:30px;font-size:13px}
  .tarefasResumoCard strong{font-size:14px}
  .tarefasModelo2Grid{grid-template-columns:1fr;gap:9px}
  .tarefaModelo2Card{padding:12px}
  .tarefaModelo2Controles{grid-template-columns:repeat(2,1fr) 48px repeat(2,1fr)}
}
@media(max-width:390px){
  .tarefasModelo2Top{gap:8px}
  .tarefasModelo2Novo{padding:8px 9px}
  .tarefasModelo2Titulo p{display:none}
  .tarefaModelo2Info{grid-template-columns:1fr}
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
  const [pessoaFoto, setPessoaFoto] = useState("");
  const pessoaFotoInputRef = useRef<HTMLInputElement | null>(null);

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
      foto: String(item.foto ?? ""),
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
    else if (aba === "Funcionários") {
      setPessoaEditandoId(null);
      setPessoaFoto("");
      setPessoaForm({ nome: "", funcao: "", telefone: "", cpf: "", endereco: "" });
      setModal("pessoa");
    }
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
      foto: pessoaFoto || pessoaAnterior?.foto || "",
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
      setPessoaFoto("");
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
    setPessoaFoto(p.foto || "");
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

  const statusFuncionario = (pessoaId: number) => {
    const estaEmObra = obras.some(
      (obra) =>
        obra.status !== "Concluído" &&
        Array.isArray(obra.equipe) &&
        obra.equipe.includes(pessoaId)
    );
    return estaEmObra ? "Ativo" : "Disponível";
  };

  const escolherFotoPessoa = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      alert("Selecione uma imagem válida.");
      return;
    }
    try {
      const foto = await comprimirFoto(arquivo);
      setPessoaFoto(foto);
    } catch (erro) {
      console.error("Falha ao preparar foto do funcionário:", erro);
      alert("Não foi possível carregar essa foto.");
    }
  };

  const conteudoFuncionarios = (
    <>
      <Header />

      <section className="panel funcionariosPanel">
        <div className="funcionariosTop">
          <div className="funcionariosTitulo">
            <div className="funcionariosTituloIcon">👥</div>
            <div>
              <h2>Funcionários</h2>
              <p>Visualize e gerencie sua equipe.</p>
            </div>
          </div>
        </div>

        {pessoas.length === 0 ? (
          <Empty texto="Nenhum funcionário cadastrado." />
        ) : (
          <div className="funcionariosGrid">
            {pessoas.map((pessoa, index) => {
              const iniciais = String(pessoa.nome || "F")
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((parte) => parte.charAt(0).toUpperCase())
                .join("") || "F";

              const tonsAvatar = ["azul", "verde", "roxo", "laranja"];
              const tomAvatar = tonsAvatar[index % tonsAvatar.length];
              const status = statusFuncionario(pessoa.id);

              return (
                <article className="funcionarioCard" key={pessoa.id}>
                  <div className="funcionarioCardHeader">
                    {pessoa.foto ? (
                      <img
                        className="funcionarioAvatar funcionarioAvatarFoto"
                        src={pessoa.foto}
                        alt={`Foto de ${pessoa.nome || "funcionário"}`}
                      />
                    ) : (
                      <div className={`funcionarioAvatar ${tomAvatar}`} aria-hidden="true">
                        {iniciais}
                      </div>
                    )}

                    <div className="funcionarioIdentidade">
                      <h3>{pessoa.nome || "Funcionário"}</h3>
                      <span>{pessoa.funcao || "Função não informada"}</span>
                    </div>

                    <span className={`funcionarioStatus ${status === "Ativo" ? "ativo" : "disponivel"}`}>
                      {status}
                    </span>
                  </div>

                  <div className="funcionarioCardInfo">
                    <div className="funcionarioInfoLinha">
                      <span className="funcionarioInfoIcon">⌂</span>
                      <span>{pessoa.endereco || "Endereço não informado"}</span>
                    </div>

                    <div className="funcionarioInfoLinha">
                      <span className="funcionarioInfoIcon">☎</span>
                      <span>{pessoa.telefone || "Telefone não informado"}</span>
                    </div>

                    <div className="funcionarioInfoLinha">
                      <span className="funcionarioInfoIcon">R$</span>
                      <strong>{dinheiro(pessoa.diaria)} <small>/ dia</small></strong>
                    </div>
                  </div>

                  <div className="funcionarioCardDivider" />

                  <div className="funcionarioCardActions">
                    <button
                      className="funcionarioVerBtn"
                      type="button"
                      onClick={() => abrirGerenciamentoPessoa(pessoa.id)}
                    >
                      Dias Trabalhados
                    </button>

                    <button
                      className="funcionarioEditBtn"
                      type="button"
                      onClick={() => editarPessoa(pessoa.id)}
                    >
                      ✏️ Editar
                    </button>

                    <button
                      className="funcionarioDeleteBtn"
                      type="button"
                      onClick={() => excluir("pessoa", pessoa.id)}
                      aria-label={`Excluir ${pessoa.nome}`}
                      title="Apaga"
                    >
                      <span className="funcionarioDeleteDesktop">Apaga</span>
                      <span className="funcionarioDeleteMobile">🗑️</span>
                    </button>
                  </div>

                  <button
                    className="funcionarioPixBtn"
                    type="button"
                    onClick={() => copiarPix(pessoa.pix)}
                  >
                    📋 Copiar chave Pix
                  </button>

                  <div className="funcionarioCpf">
                    CPF: <strong>{pessoa.cpf || "Não cadastrado"}</strong>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  const conteudoTarefas = (
    <>
      <section className="tarefasModelo2Panel">
        <div className="tarefasModelo2Top">
          <div className="tarefasModelo2Titulo">
            <div className="tarefasModelo2Icon" aria-hidden="true">☑</div>
            <div>
              <h2>Tarefas</h2>
              <p>Acompanhe o progresso de forma visual.</p>
            </div>
          </div>
          <button className="tarefasModelo2Novo" type="button" onClick={abrirModalDaAba}>
            + Nova Tarefa
          </button>
        </div>

        <div className="tarefasModelo2Resumo" aria-label="Resumo das tarefas">
          <div className="tarefasResumoCard">
            <span className="tarefasResumoIcon">▣</span>
            <div><strong>{tarefas.length}</strong><small>Total</small></div>
          </div>
          <div className="tarefasResumoCard">
            <span className="tarefasResumoIcon pendente">◆</span>
            <div><strong>{tarefas.filter((t) => t.status === "Pendente").length}</strong><small>Pendentes</small></div>
          </div>
          <div className="tarefasResumoCard">
            <span className="tarefasResumoIcon andamento">✎</span>
            <div><strong>{tarefas.filter((t) => t.status === "Em andamento").length}</strong><small>Em andamento</small></div>
          </div>
          <div className="tarefasResumoCard">
            <span className="tarefasResumoIcon concluida">✓</span>
            <div><strong>{tarefas.filter((t) => t.status === "Concluído").length}</strong><small>Concluídas</small></div>
          </div>
        </div>

        {tarefas.length === 0 ? (
          <div className="tarefasModelo2Empty">
            <div>☑</div>
            <strong>Nenhuma tarefa cadastrada.</strong>
            <span>Use “Nova Tarefa” para adicionar a primeira.</span>
          </div>
        ) : (
          <div className="tarefasModelo2Grid">
            {tarefas.map((tarefa) => {
              const percentual = Math.max(0, Math.min(100, Number(tarefa.percentual || 0)));
              return (
                <article className="tarefaModelo2Card" key={tarefa.id}>
                  <div className="tarefaModelo2Cabecalho">
                    <div>
                      <h3>{tarefa.descricao}</h3>
                      <span>{tarefa.obra || "Sem obra vinculada"}</span>
                    </div>
                    <span className="tarefaModelo2Menu" aria-hidden="true">⋮</span>
                  </div>

                  <div className="tarefaModelo2Progresso">
                    <div className="tarefaModelo2ProgressoTopo">
                      <span>Progresso</span>
                      <strong>{Math.round(percentual)}%</strong>
                    </div>
                    <div className="tarefaModelo2Barra">
                      <div style={{ width: `${percentual}%` }} />
                    </div>
                  </div>

                  <div className="tarefaModelo2Info">
                    <span>▣ {tarefa.prazo || "Sem prazo"}</span>
                    <span>♙ {tarefa.responsavel || "Sem responsável"}</span>
                  </div>

                  <div className="tarefaModelo2Controles">
                    <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, -10)}>−10%</button>
                    <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, -1)}>−1%</button>
                    <input
                      aria-label={`Progresso de ${tarefa.descricao}`}
                      inputMode="numeric"
                      value={Math.round(percentual)}
                      onChange={(e) => alterarProgressoTarefa(
                        tarefa.id,
                        Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        true
                      )}
                    />
                    <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, 1)}>+1%</button>
                    <button type="button" onClick={() => alterarProgressoTarefa(tarefa.id, 10)}>+10%</button>
                  </div>

                  <div className="tarefaModelo2Rodape">
                    <StatusSelect
                      value={tarefa.status}
                      onChange={(valor) => mudarStatusTarefa(tarefa.id, valor)}
                    />
                    <button className="tarefaModelo2Editar" type="button" onClick={() => editarTarefa(tarefa.id)}>
                      ✎ Editar
                    </button>
                    <button className="tarefaModelo2Excluir" type="button" onClick={() => excluir("tarefa", tarefa.id)} aria-label={`Excluir ${tarefa.descricao}`}>
                      🗑️
                    </button>
                  </div>

                </article>
              );
            })}
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
            <div className="logoMark logoMarkImagem" aria-label="CGL - Concept Engenharia">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABOkAAALYCAYAAAApV6ZAAAEAAElEQVR42uzd63oiudK16ydCygTsqp7v+R/kt+bssoHMlBTrhxKMXXaVa+vduPui2SegpGwYDiksIhAREREREREREZGX4xoCERERERERERGRl6WQTkRERERERERE5IUppBMREREREREREXlhCulERERERERERERemEI6ERERERERERGRF6aQTkRERERERERE5IUppBMREREREREREXlhCulERERERERERERemEI6ERERERERERGRF6aQTkRERERERERE5IUppBMREREREREREXlhCulERERERERERERemEI6ERERERERERGRF6aQTkRERERERERE5IUppBMREREREREREXlhCulERERERERERERemEI6ERERERERERGRF6aQTkRERERERERE5IUppBMREREREREREXlhWUMgIiIiIiJyZ5n3EREAmBnDeGUaFRER+dPs9MtHRERERETkozoe9xGt0Vqh1srpe5K7nw9mie3uWoGdiIj8EaqkExERERGRD+325t9orVHKTK2VthRqKwCklMg5YymR80BEjd3VPwrqRETkt1NIJyIiIiIiH9bt7ZeotVLrwjRN1Fqoy0IpM+Dk7IzjlpQSZoaZ8jkREfkzFNKJiIiIiMjHFZW2zCzLRF0mjscjZV6Y5gNGYne1oZXKdrvFvffdO+z/VTWdiIj8dgrpRERERETkQzoevkQpC/MyMc9H5vnIdLxlWSrH455Ewmm0oWAeWHLCjJyrBk9ERH47hXQiIiIiIvLh1Pk2LApRJ2o5UpYD83RkPh6Yp4XjcY81g1Zpm01vHpEGMs4wDMzTTYybT6qmExGR30YhnYiIiIiIfBh1vg1g7eK60OrCskwsy8wyHZmmA9PhyGG/B8AcjCANGRtG8Exr7dz9VURE5HdRSCciIiIiIu9SW/YREbTW+qFUIipBbxSxLDPT4ZbpcMvxuGd/e8t+v2c6HNmvIZ1j5DWky5stUQcFdCIi8kcopBMRERERkXdjmffRWiUisAhqrSzL0qvmSqW2frqUhTIfOR73HA4HpvnAcX9gv98zHycOhwOJxJIHlnFkXAqlFGqtqqQTEZE/QiGdiIiIiIi8act8WTFXYa2c69VyC/M8sywLZZl6J9cyM89Hlnmd3jpNzPPEPPXurnVe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es6nfXQ6fbruqf3++rRHX+/ptZxeF4C7fzUej+2bh+9nhc4i8tEopBMREREReacUcmhf/HYWmD/1WlRNJyLyKxTSiYiIiIh8AArs5FeZxTMq/AKscS+wM4V3IiLPoZBOREREROQdUiinffC3PG9qroI6EZHvUUgnIiIiIiIiv+TRoM6iH0RE5FkU0omIiIiIvBOqnhMREXm7FNKJiIiIiLxjCu7kT3qPXYNFRF6KQjoRERERkRfyI6t03YtC1oX4w+6fv7ydxeMf9UOZys99cYq78Q2D50SfzXpI6s+43WtnD8YBTgGdP/oF8+EsV/uhd3xbt6OAWUQ+2O8aDYGIiIiIyOsQEfcq307nLwMPx9ZwpHfaDLuLPsyMaIadTkf0e5jRIt5EGPQjzIzWGu5+HreHlYOnSq9fqfg6bdMbpFPclL6/vdMzsYC83i9sDe/4OrK6fI5hd4cXHeN1WTmPr7883r0/Y00anWgQl2+01m/T2unVtkf3k2NPdoFd5r3SOhH5EBTSiYiIiIi8Ca2HdfbtaiR7cPzYrZuq6X7uy1P8+PThsLuqsuf0UHiNPVB/9kujPUgYT2N3qqrrIV+9V50H7auqPQ8FdSLyQX7PaAhERERERES654ZwWuvvz4+xiMhHo5BOREREREQEhUcaYxGRl6WQTkRERERE5Bk+esCkTq4iIn+WQjoRERERkReiqqK3t18eNvf4aP5UUKd/CyIiCulERERERETkFylkExH5dQrpRERERERekMIN7RsRERFQSCciIiIi8qJ+ZfrgKUS6DJNO24sIzAwzO59+byICd6e19uRrPV3/J/fD735Nl6/ldP41BIattV96Hpfvzce289Q+UFgqIh+FQjoREREREREREZEXppBORERERERERETkhSmkExEREREREREReWEK6URERERERERERF6YQjoREREREREREZEXppBORERERERERETkhSmkExERERF5QRZPn/d7p9eP7vFjH+E/xgf+9mL76znC/uztX8t796vXoX/eIiL6nS0iIiIi8haY3aUxFvdDue9dDmDrFXfbaVwGVh4QEe/3Y/+9lKitr/VORKyX3R+Xx1ze9zSel/vndP50+BGn0C0icIzW2nk7EYG704h74Vyjh1wNaNa3ERHn+7TWXmTI78b0/i54aszwr8fs8vzl5Q/332P/TkRE3jOFdCIi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" alt="CGL - Concept Engenharia" />
            </div>
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
          <div className="funcionarioFotoEditor">
            <button
              type="button"
              className="funcionarioFotoBotao"
              onClick={() => pessoaFotoInputRef.current?.click()}
              title={pessoaFoto ? "Alterar foto" : "Adicionar foto"}
            >
              {pessoaFoto ? (
                <img src={pessoaFoto} alt="Foto do funcionário" />
              ) : (
                <span>👤</span>
              )}
              <span className="funcionarioFotoCamera">📷</span>
            </button>
            <div>
              <strong>Foto do funcionário</strong>
              <small>{pessoaFoto ? "Clique na foto para trocar" : "Adicione uma foto de perfil"}</small>
              <input
                ref={pessoaFotoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void escolherFotoPessoa(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

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
