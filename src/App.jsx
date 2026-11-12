import { useEffect, useRef } from 'react';
import parse from 'html-react-parser';
import { pageMarkup } from './pageMarkup.js';

const whatsappNumber = '919137440042';
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const offers = {
  'Free course counselling': ['Let’s plan your next step.', 'Share a few details and our team will guide you through the course and learning options.'],
  'Graphic Design syllabus': ['Get the Graphic Design syllabus.', 'Leave your number and we’ll prepare the module outline and batch information for you.'],
  'Fee guidance': ['Compare fees and learning modes.', 'Request a quick callback about offline and hybrid options.'],
  'VFX-inspired visual work examples': ['Explore cinematic VFX-inspired visual design.', 'Explore digital design applications alongside branding, print and packaging.'],
  'Quick course details': ['Get course details on WhatsApp.', 'Share your number and choose what you’d like to know.'],
  'Quick callback': ['Request a quick course callback.', 'Share your number and our team can help with your questions.']
};

export default function App() {
  const pageRef = useRef(null);

  useEffect(() => {
    const root = pageRef.current;
    const modal = root?.querySelector('#leadModal');
    const leadName = root?.querySelector('#leadName');
    const modalTitle = root?.querySelector('#modalTitle');
    const modalCopy = root?.querySelector('#modalCopy');
    const leadOffer = root?.querySelector('#leadOffer');
    if (!root || !modal) return undefined;

    let previousFocus = null;
    let manualOpened = false;
    let scrollShown = false;
    let exitShown = false;
    let autoCount = Number(sessionStorage.getItem('kvAutoPopupCount') || 0);
    const snoozeUntil = Number(sessionStorage.getItem('kvPopupSnooze') || 0);

    function openModal(trigger, kind) {
      previousFocus = document.activeElement;
      const selected = kind || trigger?.dataset.offer || 'Free course counselling';
      const content = offers[selected] || offers['Free course counselling'];
      modalTitle.textContent = content[0];
      modalCopy.textContent = content[1];
      leadOffer.value = selected;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (!kind) manualOpened = true;
      window.setTimeout(() => leadName?.focus(), 60);
    }

    function closeModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      sessionStorage.setItem('kvPopupSnooze', String(Date.now() + 45000));
      previousFocus?.focus?.();
    }

    function showAutoOffer(kind) {
      if (autoCount >= 2 || Date.now() < snoozeUntil || modal.classList.contains('open') || manualOpened || document.visibilityState !== 'visible') return;
      autoCount += 1;
      sessionStorage.setItem('kvAutoPopupCount', String(autoCount));
      openModal(null, kind);
    }

    async function submitForm(event) {
      const form = event.target.closest('form');
      if (!form || !root.contains(form)) return;
      event.preventDefault();
      if (!form.reportValidity()) return;

      const button = form.querySelector('button[type="submit"]');
      const previousButtonText = button?.textContent;
      if (button) { button.disabled = true; button.textContent = 'Saving enquiry…'; }
      let status = form.querySelector('[role="status"]');
      if (!status) {
        status = document.createElement('p');
        status.className = 'capture-status';
        status.setAttribute('role', 'status');
        form.appendChild(status);
      }
      status.style.display = 'block';
      status.classList.remove('error');
      status.textContent = 'Saving your enquiry…';

      const popup = window.open('about:blank', '_blank');
      const params = new URLSearchParams(window.location.search);
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.form_id = form.dataset.formId || 'form5';
      payload.landing_page = window.location.href;
      payload.referrer = document.referrer;
      for (const key of campaignKeys) payload[key] = params.get(key) || '';

      let leadId = 'direct';
      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          try {
            const result = await response.json();
            if (result && result.id) leadId = result.id;
          } catch {
            // response was not JSON, continue with fallback
          }
        }
      } catch (err) {
        console.warn('Backend lead capture offline, proceeding to WhatsApp:', err);
      }

      const attribution = campaignKeys.filter(key => payload[key]).map(key => `${key}: ${payload[key]}`);
      const message = [
        `Hello Kshitij Vivan, I would like to enquire about: ${payload.offer || 'Graphic Design course'}.`,
        `Name: ${payload.name || ''}`,
        `Mobile: ${payload.phone || ''}`,
        ...(payload.city ? [`City: ${payload.city}`] : []),
        `Preferred mode: ${payload.mode || 'Not specified'}`,
        `Enquiry: ${payload.goal || payload.offer || 'Course details'}`,
        ...(leadId !== 'direct' ? [`Enquiry reference: ${leadId}`] : []),
        ...(attribution.length ? [`Campaign attribution: ${attribution.join(' | ')}`] : [])
      ].join('\n');
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      status.classList.remove('error');
      status.textContent = 'Opening WhatsApp to complete your enquiry…';
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { form_id: payload.form_id });
      if (popup) popup.location.href = whatsappUrl;
      else window.location.href = whatsappUrl;
      if (button) { button.disabled = false; button.textContent = previousButtonText; }
    }

    function handleClick(event) {
      const openButton = event.target.closest('[data-open]');
      if (openButton && root.contains(openButton)) { openModal(openButton); return; }
      const closeButton = event.target.closest('[data-close]');
      if (closeButton && root.contains(closeButton)) closeModal();
      if (event.target === modal) closeModal();
    }
    function handleKey(event) {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    }
    function handleScroll() {
      if (scrollShown) return;
      const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollRange > 0 && window.scrollY / scrollRange > 0.52) {
        scrollShown = true;
        showAutoOffer('Graphic Design syllabus');
      }
    }
    function handleExit(event) {
      if (!exitShown && event.clientY <= 0) { exitShown = true; showAutoOffer('Fee guidance'); }
    }

    root.addEventListener('submit', submitForm);
    root.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mouseout', handleExit);
    const popupTimer = window.setTimeout(() => showAutoOffer('Free course counselling'), 22000);

    return () => {
      root.removeEventListener('submit', submitForm);
      root.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mouseout', handleExit);
      window.clearTimeout(popupTimer);
      document.body.style.overflow = '';
    };
  }, []);

  return <div ref={pageRef}>{parse(pageMarkup)}</div>;
}
