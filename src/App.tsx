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
.logoMarkImagem img{width:100%;height:100%;display:block;object-fit:contain;border-radius:10px;background:#fff}
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
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABgAAAAX3CAIAAAAG8ycAAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAEAAElEQVR42uzdebxkZ1Xv/7WeZ++qOlN3J+mkkw4JGQgJMwIKCle4TjiAF4OCJA5BJYiKoKggoODVi4rihPpTFMUJrlwHNKLg1R9RfyIqokgQEiCEzOn0dOaqvfez1u+PXae6+kx9zkkPVbs/71delTpVdXbt/dQ+51R9ez3rUXcXAAAAAAAANFdgCAAAAAAAAJqNAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAAAKDhCIAAAAAAAAAajgAIAAAAAACg4QiAAAAAAAAAGo4ACAAAAAAAoOEIgAAAAAAAABqOAAgAAAAA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nAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAUDgBCAAAAKBwAhAAAABA4QQgAAAAgMIJQAAAAACFE4AAAAAACicAAQAAABROAAIAAAAonAAEAAAAULj/H/6RikIt2c26AAAAAElFTkSuQmCC" alt="CGL - Concept Engenharia" />
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
