import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanComparisonModal } from './PlanComparisonModal';

describe('PlanComparisonModal UI & Requirements Test Suite', () => {
  it('1. Returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: false,
        onClose: () => {},
        onSelectPlan: () => {},
      })
    );
    assert.equal(html, '');
  });

  it('2. Renders spacious header with Kudumba logo, title, and subtitle', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
      })
    );

    assert.ok(html.includes('Choose Your Household Plan'), 'Modal title must be present');
    assert.ok(
      html.includes('Simple, transparent pricing tailored for families in Kerala &amp; the Gulf.'),
      'Modal subtitle must be present'
    );
    assert.ok(html.includes('Back to Dashboard'), 'Back to Dashboard button must be present');
    assert.ok(html.includes('Open in new tab'), 'Open in new tab button must be present');
    assert.ok(html.includes('aria-label="Close modal"'), 'Close button must have accessible label');
  });

  it('3. Renders all three cards: Founding Household, NRI Family Plus, Partners & Societies', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        currentEntitlement: {
          planId: 'founding-free',
          status: 'active',
          isTrialing: true,
        },
      })
    );

    // Card 1
    assert.ok(html.includes('Free — Founding Household'), 'Founding Household card title');
    assert.ok(html.includes('CURRENT FREE TRIAL'), 'Founding Household trial badge');
    assert.ok(html.includes('₹0'), 'Founding Household ₹0 price');
    assert.ok(html.includes('3 DAYS'), 'Founding Household 3 DAYS duration');
    assert.ok(html.includes('Maximum 5 family members'), 'Founding quota 5 members');
    assert.ok(html.includes('Only 3 GB of secure cloud storage'), 'Founding quota 3 GB');
    assert.ok(html.includes('Selected'), 'Selected disabled button for current active plan');

    // Card 2
    assert.ok(html.includes('NRI Family Plus'), 'NRI Family Plus card title');
    assert.ok(html.includes('POPULAR'), 'POPULAR badge on NRI card');
    assert.ok(html.includes('LIMITED TIME OFFER'), 'Limited time offer badge');
    assert.ok(html.includes('₹249'), 'NRI Plus ₹249 price');
    assert.ok(html.includes('/month'), 'NRI Plus /month cadence');
    assert.ok(html.includes('3 months'), 'Duration selector 3 months');
    assert.ok(!html.includes('6 months'), '6 months option removed');
    assert.ok(!html.includes('1 year'), '1 year option removed');
    assert.ok(html.includes('You save ₹1,500 today'), 'Savings pill');
    assert.ok(html.includes('Maximum 12 family members'), 'NRI Plus 12 members');
    assert.ok(html.includes('Only 15 GB of high-resolution document storage'), 'NRI Plus 15 GB');
    assert.ok(html.includes('Continue'), 'Continue action button');

    // Card 3
    assert.ok(html.includes('Partners &amp; Societies'), 'Partners & Societies card title');
    assert.ok(html.includes('ULTRA'), 'ULTRA badge on Partners card');
    assert.ok(html.includes('₹999'), 'Partners ₹999 price');
    assert.ok(html.includes('Maximum 50 family/client seats'), 'Partners 50 seats');
    assert.ok(html.includes('Only 100 GB of vault storage'), 'Partners 100 GB');
    assert.ok(html.includes('Contact sales'), 'Contact sales action button');
  });

  it('4. Does not render temporary online payments unavailable banner', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
      })
    );

    assert.ok(!html.includes('Online payments are temporarily unavailable'), 'Notice is removed');
  });

  it('5. Renders error message banner when checkoutError is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        checkoutError: 'Online payments are temporarily unavailable. Please contact support.',
      })
    );

    assert.ok(html.includes('Online payments are temporarily unavailable. Please contact support.'), 'Checkout error rendered');
  });

  it('6. Supports Malayalam localization when lang="ml"', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        lang: 'ml',
        onClose: () => {},
        onSelectPlan: () => {},
      })
    );

    assert.ok(html.includes('നിങ്ങളുടെ കുടുംബ പ്ലാൻ തിരഞ്ഞെടുക്കുക'), 'Malayalam title');
    assert.ok(html.includes('എൻ.ആർ.ഐ ഫാമിലി പ്ലസ്'), 'Malayalam NRI Plus');
    assert.ok(html.includes('തുടരുക'), 'Malayalam Continue button');
  });

  it('7. Active NRI Family Plus subscription correctly marks ONLY NRI Family Plus as CURRENT PLAN', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        currentEntitlement: {
          planId: 'nri-plus',
          status: 'active',
        },
      })
    );

    // Free card must NOT be marked CURRENT PLAN
    assert.ok(!html.includes('CURRENT FREE TRIAL'), 'Free card must NOT show CURRENT FREE TRIAL');
    assert.ok(html.includes('FREE TIER'), 'Free card shows FREE TIER');
    assert.ok(html.includes('Downgrade to Free'), 'Free card shows Downgrade to Free button');

    // NRI Family Plus card must have CURRENT PLAN badge and disabled Active Plan button
    assert.ok(html.includes('CURRENT PLAN'), 'NRI Family Plus card has CURRENT PLAN badge');
    assert.ok(html.includes('Active Plan (NRI Family Plus)'), 'NRI Family Plus has disabled Active Plan button');

    // Partners & Societies must NOT have CURRENT PLAN
    assert.ok(html.includes('Contact sales'), 'Partners & Societies shows Contact sales button');

    // Count occurrences of "CURRENT PLAN"
    const currentPlanMatches = html.match(/CURRENT PLAN/g) || [];
    assert.equal(currentPlanMatches.length, 1, 'CURRENT PLAN badge must appear exactly once');
  });

  it('8. Active Partners & Societies subscription correctly marks ONLY Partners & Societies as CURRENT PLAN', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        currentEntitlement: {
          planId: 'partner-pro',
          status: 'active',
        },
      })
    );

    // Free card must NOT be marked CURRENT PLAN
    assert.ok(!html.includes('CURRENT FREE TRIAL'), 'Free card must NOT show CURRENT FREE TRIAL');
    assert.ok(html.includes('FREE TIER'), 'Free card shows FREE TIER');
    assert.ok(html.includes('Downgrade to Free'), 'Free card shows Downgrade to Free button');

    // NRI card must show LIMITED TIME OFFER and Continue button
    assert.ok(html.includes('LIMITED TIME OFFER'), 'NRI card shows LIMITED TIME OFFER');
    assert.ok(html.includes('Continue'), 'NRI card shows Continue button');

    // Partners card must have CURRENT PLAN badge and disabled Active Plan button
    assert.ok(html.includes('CURRENT PLAN'), 'Partners card has CURRENT PLAN badge');
    assert.ok(html.includes('Active Plan (Partners &amp; Societies)'), 'Partners card has disabled Active Plan button');

    // Count occurrences of "CURRENT PLAN"
    const currentPlanMatches = html.match(/CURRENT PLAN/g) || [];
    assert.equal(currentPlanMatches.length, 1, 'CURRENT PLAN badge must appear exactly once');
  });

  it('9. Pending payment keeps existing active plan marked as CURRENT PLAN', () => {
    // User is on Free plan and has submitted payment for NRI Plus (pending approval)
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        currentEntitlement: {
          planId: 'founding-free',
          status: 'active',
          isTrialing: true,
        },
      })
    );

    // Free card continues to display CURRENT FREE TRIAL
    assert.ok(html.includes('CURRENT FREE TRIAL'), 'Free card displays CURRENT FREE TRIAL');
    assert.ok(html.includes('Selected'), 'Free card button shows Selected');

    // NRI card does NOT display CURRENT PLAN
    assert.ok(html.includes('LIMITED TIME OFFER'), 'NRI card shows LIMITED TIME OFFER');
    assert.ok(html.includes('Continue'), 'NRI card shows Continue action button');
    assert.ok(!html.includes('Active Plan (NRI Family Plus)'), 'NRI card is NOT marked as active');
  });

  it('10. Expired NRI Family Plus plan displays EXPIRED PLAN and Renew Plan button', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanComparisonModal, {
        isOpen: true,
        onClose: () => {},
        onSelectPlan: () => {},
        currentEntitlement: {
          planId: 'nri-plus',
          status: 'expired',
        },
      })
    );

    // Free card is not current
    assert.ok(html.includes('FREE TIER'), 'Free card shows FREE TIER');
    assert.ok(html.includes('Downgrade to Free'), 'Free card shows Downgrade to Free button');

    // NRI Family Plus shows EXPIRED PLAN badge and Renew Plan action
    assert.ok(html.includes('EXPIRED PLAN'), 'NRI Family Plus shows EXPIRED PLAN badge');
    assert.ok(html.includes('Renew Plan'), 'NRI Family Plus shows Renew Plan button');
    assert.ok(!html.includes('Active Plan (NRI Family Plus)'), 'NRI Family Plus does not show Active Plan');
  });
});
