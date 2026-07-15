
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
