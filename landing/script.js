/* ============================================
   AI Multiplexer — Landing Page Script
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ===== 0. Latest public release label — cosmetic, non-blocking =====
  const releaseLabels = document.querySelectorAll('[data-release-label]');
  if (releaseLabels.length > 0) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    fetch('https://api.github.com/repos/hoan9an/ai-chat-multiplexer/releases?per_page=10', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
        return response.json();
      })
      .then(releases => {
        const latest = Array.isArray(releases)
          ? releases.find(release => !release.draft && typeof release.tag_name === 'string')
          : null;
        if (!latest) return;

        const label = latest.prerelease ? `${latest.tag_name} beta` : latest.tag_name;
        releaseLabels.forEach(el => { el.textContent = label; });
      })
      .catch(() => {
        // Keep the evergreen "Latest beta" fallback when offline or rate-limited.
      })
      .finally(() => window.clearTimeout(timeoutId));
  }

  // ===== 1. OS detection — show platform-specific download =====
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

  // ===== 2. Navbar scroll effect =====
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // ===== 3. Mobile nav toggle =====
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-controls', 'navLinks');
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(navLinks.classList.contains('open')));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ===== 4. Scroll reveal =====
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach(el => observer.observe(el));

  // ===== 5. Interactive Mockup — Layout switcher =====
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

  // ===== 6. FAQ accordion =====
  document.querySelectorAll('.faq-item').forEach((item, index) => {
    const question = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-answer');
    if (!question) return;
    const answerId = `faq-answer-${index + 1}`;
    if (answer) answer.id = answerId;
    question.setAttribute('aria-controls', answerId);
    question.setAttribute('aria-expanded', String(item.classList.contains('active')));
    question.addEventListener('click', () => {
      const wasActive = item.classList.contains('active');
      // Close all
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('active');
        i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
      });
      // Toggle clicked
      if (!wasActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ===== 7. Smooth scroll for anchor links =====
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

  // ===== 8. Parallax floating badges on mouse move =====
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
