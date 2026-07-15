
document.getElementById("year")?.append(new Date().getFullYear());
const observer=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add("visible");observer.unobserve(e.target)}
  })
},{threshold:.1});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));


// Mobile navigation
const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.topbar nav');
if (menuToggle && mobileNav) {
  const closeMenu = () => {
    mobileNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  });

  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!mobileNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) closeMenu();
  });
}

// Quote section
const quoteForm = document.getElementById('quoteForm');
const qTipo = document.getElementById('qTipo');
const qObjetivo = document.getElementById('qObjetivo');
const qPrazo = document.getElementById('qPrazo');
const qInvestimento = document.getElementById('qInvestimento');
const quoteNivel = document.getElementById('quoteNivel');
const quoteFaixa = document.getElementById('quoteFaixa');
const quoteTempo = document.getElementById('quoteTempo');
const quoteTexto = document.getElementById('quoteTexto');
const sendQuoteWhats = document.getElementById('sendQuoteWhats');
const sendQuoteEmail = document.getElementById('sendQuoteEmail');

const quoteConfigs = {
  site: {
    nivel: 'Essencial',
    tempo: '7 a 15 dias',
    texto: 'Indicado para apresentar serviços, transmitir profissionalismo e captar contatos com mais credibilidade.'
  },
  landing: {
    nivel: 'Essencial',
    tempo: '5 a 10 dias',
    texto: 'Boa opção para campanhas, páginas de venda, lançamentos ou captação rápida de contatos.'
  },
  loja: {
    nivel: 'Intermediário',
    tempo: '12 a 25 dias',
    texto: 'Ideal para vender online com catálogo, pedidos, produtos e uma experiência mais completa.'
  },
  dashboard: {
    nivel: 'Intermediário',
    tempo: '10 a 20 dias',
    texto: 'Excelente para acompanhar indicadores, relatórios e transformar dados em decisões.'
  },
  sistema: {
    nivel: 'Avançado',
    tempo: '20 a 45 dias',
    texto: 'Indicado para processos internos, automação, controle operacional e regras de negócio específicas.'
  },
  outro: {
    nivel: 'Personalizado',
    tempo: 'A combinar',
    texto: 'Projeto fora do padrão inicial. A necessidade será analisada para definir uma solução sob medida.'
  }
};

function selectedText(select, fallback = 'Não informado') {
  if (!select || !select.value) return fallback;
  return select.options[select.selectedIndex]?.text || fallback;
}

function getSelectedDores() {
  return [...document.querySelectorAll('input[name="dor"]:checked')].map(item => item.value);
}

function updateQuoteEstimate() {
  if (!qTipo || !quoteNivel || !quoteFaixa || !quoteTempo || !quoteTexto) return;

  const config = quoteConfigs[qTipo.value] || {
    nivel: 'A definir',
    tempo: 'A definir',
    texto: 'Selecione o tipo de projeto para receber uma leitura inicial. O valor final será definido somente após a análise do escopo.'
  };

  let nivel = config.nivel;
  const dores = getSelectedDores().length;
  const urgente = qPrazo?.value === 'urgente';

  if (dores >= 4 && nivel === 'Essencial') nivel = 'Intermediário';
  if ((dores >= 4 || urgente) && nivel === 'Intermediário') nivel = 'Avançado';

  quoteNivel.textContent = nivel;
  quoteFaixa.textContent = 'Após análise';
  quoteTempo.textContent = config.tempo;
  quoteTexto.textContent = config.texto;
}

function getQuoteData() {
  return {
    nome: document.getElementById('qNome')?.value.trim() || 'Não informado',
    empresa: document.getElementById('qEmpresa')?.value.trim() || 'Não informado',
    contato: document.getElementById('qContato')?.value.trim() || 'Não informado',
    tipo: selectedText(qTipo),
    objetivo: selectedText(qObjetivo),
    investimento: selectedText(qInvestimento),
    prazo: selectedText(qPrazo),
    dores: getSelectedDores(),
    descricao: document.getElementById('qDescricao')?.value.trim() || 'Não informado',
    complexidade: quoteNivel?.textContent || 'A definir',
    prazoReferencia: quoteTempo?.textContent || 'A definir'
  };
}

function buildWhatsAppMessage() {
  const data = getQuoteData();
  const dores = data.dores.length
    ? data.dores.map(item => `- ${item}`).join('\n')
    : '- Não informado';

  const divider = '-'.repeat(34);

  return [
    '*SOLICITAÇÃO DE PRÉ-ORÇAMENTO*',
    '_Enviado pelo portfólio de Euler Nascimento_',
    divider,
    '',
    '*DADOS DE CONTATO*',
    `- *Nome:* ${data.nome}`,
    `- *Empresa/negócio:* ${data.empresa}`,
    `- *Contato para retorno:* ${data.contato}`,
    '',
    '*INFORMAÇÕES DO PROJETO*',
    `- *Tipo:* ${data.tipo}`,
    `- *Objetivo principal:* ${data.objetivo}`,
    `- *Investimento previsto:* ${data.investimento}`,
    `- *Prazo desejado:* ${data.prazo}`,
    '',
    '*PRINCIPAIS NECESSIDADES*',
    dores,
    '',
    '*DESCRIÇÃO DO PROJETO*',
    data.descricao,
    '',
    '*PRÉ-AVALIAÇÃO*',
    `- *Perfil do projeto:* ${data.complexidade}`,
    `- *Prazo de referência:* ${data.prazoReferencia}`,
    '- *Orçamento:* definido após análise completa do escopo',
    '',
    divider,
    'Gostaria de conversar sobre os próximos passos.'
  ].join('\n');
}

function buildEmailMessage() {
  const data = getQuoteData();
  const dores = data.dores.length
    ? data.dores.map(item => `- ${item}`).join('\n')
    : '- Não informado';

  const divider = '-'.repeat(58);

  return [
    'NOVA SOLICITAÇÃO DE PRÉ-ORÇAMENTO',
    'Portfólio Euler Nascimento | Sistemas Web',
    divider,
    '',
    'Olá, Euler,',
    '',
    'Segue abaixo um novo briefing preenchido pelo seu portfólio.',
    '',
    '01 | DADOS DE CONTATO',
    `Nome: ${data.nome}`,
    `Empresa ou negócio: ${data.empresa}`,
    `Contato para retorno: ${data.contato}`,
    '',
    '02 | INFORMAÇÕES DO PROJETO',
    `Tipo de projeto: ${data.tipo}`,
    `Objetivo principal: ${data.objetivo}`,
    `Investimento previsto: ${data.investimento}`,
    `Prazo desejado: ${data.prazo}`,
    '',
    '03 | PRINCIPAIS NECESSIDADES',
    dores,
    '',
    '04 | DESCRIÇÃO DO PROJETO',
    data.descricao,
    '',
    '05 | PRÉ-AVALIAÇÃO AUTOMÁTICA',
    `Perfil do projeto: ${data.complexidade}`,
    `Prazo de referência: ${data.prazoReferencia}`,
    'Orçamento: definido após análise completa do escopo',
    '',
    divider,
    'PRÓXIMO PASSO',
    'Analisar a necessidade, alinhar o escopo e preparar uma proposta personalizada.',
    '',
    'Esta mensagem foi gerada automaticamente pelo formulário de pré-orçamento do portfólio.'
  ].join('\n');
}

if (quoteForm) {
  quoteForm.addEventListener('change', updateQuoteEstimate);
  quoteForm.addEventListener('input', updateQuoteEstimate);
  updateQuoteEstimate();
}

if (sendQuoteWhats) {
  sendQuoteWhats.addEventListener('click', () => {
    const message = encodeURIComponent(buildWhatsAppMessage());
    window.open(`https://wa.me/5535997490869?text=${message}`, '_blank', 'noopener');
  });
}

if (sendQuoteEmail) {
  sendQuoteEmail.addEventListener('click', () => {
    const data = getQuoteData();
    const subject = encodeURIComponent(`Pré-orçamento: ${data.tipo} — ${data.nome}`);
    const body = encodeURIComponent(buildEmailMessage());
    window.location.href = `mailto:eulernasc2015@gmail.com?subject=${subject}&body=${body}`;
  });
}
