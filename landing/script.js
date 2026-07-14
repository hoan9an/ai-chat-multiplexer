/* ============================================
   AI Multiplexer — Landing Page Script
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ===== 0. OS detection — show platform-specific download =====
  const ua = navigator.userAgent || '';
  const isWin = /Win(dows|64)/i.test(ua);
  const isMac = /Mac(intosh| OS X)/i.test(ua);

  // All download buttons: data-os="win|mac|any"
  document.querySelectorAll('[data-os]').forEach(el => {
    const os = el.dataset.os;
    if (os === 'win' && isWin) el.style.display = '';
    else if (os === 'mac' && isMac) el.style.display = '';
    else if (os === 'any') el.style.display = '';
    else el.style.display = 'none';
  });

  // ===== 1. Navbar scroll effect =====
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // ===== 2. Mobile nav toggle =====
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ===== 3. Scroll reveal =====
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach(el => observer.observe(el));

  // ===== 4. Interactive Mockup — Layout switcher =====
  const mockupGrid = document.getElementById('mockupGrid');
  const layoutBtns = document.querySelectorAll('.layout-btn');

  if (mockupGrid && layoutBtns.length > 0) {
    layoutBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        layoutBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const cols = btn.dataset.layout; // "1", "2", "3", "4"
        mockupGrid.className = 'mockup-grid cols-' + cols;
      });
    });
  }

  // ===== 5. FAQ accordion =====
  document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-q');
    if (!question) return;
    question.addEventListener('click', () => {
      const wasActive = item.classList.contains('active');
      // Close all
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      // Toggle clicked
      if (!wasActive) item.classList.add('active');
    });
  });

  // ===== 6. Smooth scroll for anchor links =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ===== 7. Parallax floating badges on mouse move =====
  const floatBadges = document.querySelectorAll('.float-badge');
  if (floatBadges.length > 0 && window.innerWidth > 768) {
    const hero = document.querySelector('.hero-visual');
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 10;
      floatBadges.forEach((badge, i) => {
        const f = (i + 1) * 0.5;
        badge.style.transform = `translate(${x * f}px, ${y * f}px)`;
      });
    });
    hero.addEventListener('mouseleave', () => {
      floatBadges.forEach(b => { b.style.transform = ''; });
    });
  }

  // ===== 9. Back to top button =====
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 500) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  console.log('AI Multiplexer — Landing page ready');
});
