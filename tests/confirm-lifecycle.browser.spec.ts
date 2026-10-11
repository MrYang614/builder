import { test, expect } from '@playwright/test';

type ConfirmationProbe = {
  ready: boolean;
  results: string[];
  request: (message: string) => Promise<string>;
  unmount: () => void;
};

test('replacement and unmount settle actual confirmation provider callers', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const reactURL = resources.find((url) => /\/react\.js(?:\?|$)/.test(url))!;
    const domURL = resources.find((url) => /\/react-dom_client\.js(?:\?|$)/.test(url))!;
    const reactModule = await import(reactURL);
    const { createElement, useLayoutEffect } = reactModule.default ?? reactModule;
    const domModule = await import(domURL);
    const { createRoot } = domModule.default ?? domModule;
    const confirmationURL = '/src/ui/confirm.tsx';
    const languageURL = '/src/ui/i18n.ts';
    const { ConfirmProvider, useConfirm } = await import(confirmationURL);
    const { LanguageProvider } = await import(languageURL);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const probe: ConfirmationProbe = {
      ready: false,
      results: [],
      request: async () => 'cancel',
      unmount: () => {
        root.unmount();
        container.remove();
      },
    };
    Object.assign(window, { __confirmationProbe: probe });
    function Requests() {
      const request = useConfirm();
      useLayoutEffect(() => {
        probe.request = request;
        probe.ready = true;
      }, [request]);
      return null;
    }
    // Use the real provider and real Radix dialog; the harness owns no editor or Canvas.
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(ConfirmProvider, null, createElement(Requests)),
      ),
    );
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __confirmationProbe: ConfirmationProbe }).__confirmationProbe.ready,
  );
  await page.evaluate(() => {
    const probe = (window as unknown as { __confirmationProbe: ConfirmationProbe })
      .__confirmationProbe;
    void probe.request('confirm').then((value) => probe.results.push(`first:${value}`));
    void probe.request('confirm').then((value) => probe.results.push(`second:${value}`));
  });
  const results = () =>
    page.evaluate(
      () =>
        (window as unknown as { __confirmationProbe: ConfirmationProbe }).__confirmationProbe
          .results,
    );
  await expect.poll(results).toEqual(['first:cancel']);
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect.poll(results).toEqual(['first:cancel', 'second:cancel']);
  await page.evaluate(() => {
    const probe = (window as unknown as { __confirmationProbe: ConfirmationProbe })
      .__confirmationProbe;
    void probe.request('confirm').then((value) => probe.results.push(`third:${value}`));
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __confirmationProbe: ConfirmationProbe }).__confirmationProbe.unmount(),
  );
  await expect.poll(results).toEqual(['first:cancel', 'second:cancel', 'third:cancel']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
