
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
  site: { nivel: 'Essencial', faixa: 'R$ 900 a R$ 1.800', tempo: '7 a 15 dias', texto: 'Indicado para apresentar serviços, transmitir profissionalismo e captar contatos com mais credibilidade.' },
  landing: { nivel: 'Essencial', faixa: 'R$ 700 a R$ 1.400', tempo: '5 a 10 dias', texto: 'Boa opção para campanhas, páginas de venda, lançamentos ou captação rápida de leads.' },
  loja: { nivel: 'Intermediário', faixa: 'R$ 1.500 a R$ 3.000', tempo: '12 a 25 dias', texto: 'Ideal para vender online com catálogo, pedidos, produtos e uma experiência mais completa.' },
  dashboard: { nivel: 'Intermediário', faixa: 'R$ 1.200 a R$ 3.500', tempo: '10 a 20 dias', texto: 'Excelente para acompanhar indicadores, relatórios e transformar dados em decisões.' },
  sistema: { nivel: 'Avançado', faixa: 'R$ 2.500 a R$ 8.000+', tempo: '20 a 45 dias', texto: 'Indicado para processos internos, automação, controle operacional e regras de negócio específicas.' },
  outro: { nivel: 'Personalizado', faixa: 'Sob análise', tempo: 'A combinar', texto: 'Projeto fora do padrão inicial. Vou analisar a necessidade para montar uma solução sob medida.' }
};

function getSelectedDores() {
  return [...document.querySelectorAll('input[name="dor"]:checked')].map(item => item.value);
}

function updateQuoteEstimate() {
  if (!qTipo || !quoteNivel || !quoteFaixa || !quoteTempo || !quoteTexto) return;
  const config = quoteConfigs[qTipo.value] || { nivel: 'Essencial', faixa: 'A definir', tempo: 'A definir', texto: 'Selecione o tipo de projeto para eu te dar uma leitura inicial e agilizar o orçamento.' };
  let nivel = config.nivel;
  const dores = getSelectedDores().length;
  const urgente = qPrazo && qPrazo.value === 'urgente';

  if (dores >= 4 && nivel === 'Essencial') nivel = 'Intermediário';
  if ((dores >= 4 || urgente) && (nivel === 'Intermediário')) nivel = 'Avançado';

  quoteNivel.textContent = nivel;
  quoteFaixa.textContent = config.faixa;
  quoteTempo.textContent = config.tempo;
  quoteTexto.textContent = config.texto;
}

function buildQuoteMessage() {
  const nome = document.getElementById('qNome')?.value.trim() || '-';
  const empresa = document.getElementById('qEmpresa')?.value.trim() || '-';
  const contato = document.getElementById('qContato')?.value.trim() || '-';
  const tipo = qTipo?.options[qTipo.selectedIndex]?.text || '-';
  const objetivo = qObjetivo?.options[qObjetivo.selectedIndex]?.text || '-';
  const investimento = qInvestimento?.options[qInvestimento.selectedIndex]?.text || '-';
  const prazo = qPrazo?.options[qPrazo.selectedIndex]?.text || '-';
  const dores = getSelectedDores();
  const descricao = document.getElementById('qDescricao')?.value.trim() || '-';

  return [
    'Olá, Euler! Preenchi o pré-orçamento do seu portfólio:',
    '',
    `Nome: ${nome}`,
    `Empresa/negócio: ${empresa}`,
    `Contato: ${contato}`,
    `Tipo de projeto: ${tipo}`,
    `Objetivo principal: ${objetivo}`,
    `Faixa de investimento: ${investimento}`,
    `Prazo desejado: ${prazo}`,
    `Dor principal: ${dores.length ? dores.join('; ') : '-'}`,
    `Descrição: ${descricao}`,
    '',
    'Leitura inicial:',
    `• Complexidade: ${quoteNivel?.textContent || '-'}`,
    `• Faixa sugerida: ${quoteFaixa?.textContent || '-'}`,
    `• Prazo estimado: ${quoteTempo?.textContent || '-'}`,
  ].join('\n');
}

if (quoteForm) {
  quoteForm.addEventListener('change', updateQuoteEstimate);
  quoteForm.addEventListener('input', updateQuoteEstimate);
  updateQuoteEstimate();
}

if (sendQuoteWhats) {
  sendQuoteWhats.addEventListener('click', () => {
    const message = encodeURIComponent(buildQuoteMessage());
    window.open(`https://wa.me/5535997490869?text=${message}`, '_blank', 'noopener');
  });
}

if (sendQuoteEmail) {
  sendQuoteEmail.addEventListener('click', () => {
    const nome = document.getElementById('qNome')?.value.trim();
    const empresa = document.getElementById('qEmpresa')?.value.trim();
    const subjectParts = ['Solicitação de orçamento'];
    if (nome) subjectParts.push(nome);
    if (empresa) subjectParts.push(empresa);

    const subject = encodeURIComponent(subjectParts.join(' - '));
    const body = encodeURIComponent(buildQuoteMessage());
    window.location.href = `mailto:eulernasc2015@gmail.com?subject=${subject}&body=${body}`;
  });
}
