# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-states.browser.spec.ts >> A35 en/light actual portals, errors, disabled/focus states and compact layout
- Location: tests\ui-states.browser.spec.ts:30:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-slot="tooltip-content"]')
Expected: 0
Received: 1
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" locator('[data-slot="tooltip-content"]') with timeout 10000ms
  - waiting for locator('[data-slot="tooltip-content"]')
    24 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - strong [ref=e6]: Building editor
        - generic [ref=e7]: Courtyard
        - generic [ref=e8]: Saved
      - generic [ref=e9]:
        - button "New" [ref=e10]
        - button "Open" [ref=e11]
        - button "Save" [ref=e12]
        - button "Save as" [ref=e13]
        - button "Undo" [disabled]
        - button "Redo" [disabled]
        - button "Export GLB" [ref=e14]
        - button "Settings" [ref=e15]
    - navigation "Select" [ref=e16]:
      - radiogroup [ref=e17]:
        - radio "Select" [checked] [ref=e18]
        - radio "Wall" [ref=e19]
        - radio "Slab" [ref=e20]
        - radio "Door" [ref=e21]
        - radio "Window" [ref=e22]
        - radio "Material" [ref=e23]
      - button "Editable example" [ref=e24]
    - generic [ref=e25]:
      - complementary "Levels" [ref=e26]:
        - generic [ref=e27]:
          - heading "Levels" [level=2] [ref=e28]
          - button "Add level" [ref=e29]
        - generic [ref=e30]:
          - button "1 0.00 m" [ref=e31]:
            - generic [ref=e32]: "1"
            - generic [ref=e33]: 0.00 m
          - button "2 3.00 m" [ref=e34]:
            - generic [ref=e35]: "2"
            - generic [ref=e36]: 3.00 m
        - generic [ref=e38]:
          - group [ref=e39]:
            - generic [ref=e40]: Name
            - textbox "Name" [ref=e41]: "1"
          - group [ref=e42]:
            - generic [ref=e43]: Level base elevation (m)
            - textbox "Level base elevation (m)" [ref=e44]: "0"
          - group [ref=e45]:
            - generic [ref=e46]: Level height (m)
            - textbox "Level height (m)" [ref=e47]: "3"
          - paragraph [ref=e48]: Change level height and move all levels above (walls keep their height)
          - button "Delete level" [ref=e49]
        - generic [ref=e50]:
          - heading "Objects" [level=3] [ref=e51]
          - paragraph [ref=e52]: 7 objects
          - button "Wall 1" [active] [ref=e53]
          - button "Wall 2" [ref=e54]
          - button "Wall 3" [ref=e55]
          - button "Wall 4" [ref=e56]
          - button "Slab 5" [ref=e57]
          - button "Door 6" [ref=e58]
          - button "Window 7" [ref=e59]
        - generic [ref=e60]: Project v1
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e63]:
            - button "Focus selection" [ref=e64]
            - button "Current level" [ref=e65]
            - button "Whole building" [ref=e66]
            - button "Top view" [ref=e67]
          - radiogroup "Edit" [ref=e68]:
            - radio "Edit" [checked] [ref=e69]
            - radio "Rotate" [ref=e70]
            - radio "Pan" [ref=e71]
          - generic [ref=e72] [cursor=pointer]:
            - checkbox "Building preview (read only)" [ref=e73]
            - text: Building preview (read only)
        - generic "Building editor" [ref=e74]:
          - generic "3D editing viewport" [ref=e75]
      - complementary "Properties" [ref=e76]:
        - heading "Properties" [level=2] [ref=e77]
        - generic [ref=e78]:
          - generic [ref=e79]:
            - text: Wall
            - button "Delete" [ref=e80]
          - generic [ref=e82]:
            - group [ref=e83]:
              - generic [ref=e84]: Axis length (m)
              - textbox "Axis length (m)" [ref=e85]: "6"
            - group [ref=e86]:
              - generic [ref=e87]: Height (m)
              - textbox "Height (m)" [ref=e88]: "2.8"
            - group [ref=e89]:
              - generic [ref=e90]: Thickness (m)
              - textbox "Thickness (m)" [ref=e91]: "0.2"
            - group [ref=e92]:
              - generic [ref=e93]: Start X (m)
              - textbox "Start X (m)" [ref=e94]: "-3"
            - group [ref=e95]:
              - generic [ref=e96]: Start Z (m)
              - textbox "Start Z (m)" [ref=e97]: "-2"
          - generic [ref=e98]:
            - heading "Material" [level=3] [ref=e99]
            - generic [ref=e100]:
              - group [ref=e101]:
                - generic [ref=e102]: Surface
                - combobox "Surface" [ref=e103]:
                  - generic: Side A
              - group [ref=e104]:
                - generic [ref=e105]: Material color
                - textbox "Material color" [ref=e106] [cursor=pointer]: "#ded8cd"
              - group [ref=e107]:
                - generic [ref=e108]: Image
                - combobox "Image" [ref=e109]:
                  - generic: Brick
              - img "Image" [ref=e110]
              - button "Import PNG / JPEG" [ref=e111]
              - group [ref=e112]:
                - generic [ref=e113]: Tile width (m)
                - textbox "Tile width (m)" [ref=e114]: "0.5"
              - group [ref=e115]:
                - generic [ref=e116]: Tile height (m)
                - textbox "Tile height (m)" [ref=e117]: "0.5"
              - group [ref=e118]:
                - generic [ref=e119]: Texture rotation (°)
                - textbox "Texture rotation (°)" [ref=e120]: "0"
              - group [ref=e121]:
                - generic [ref=e122]: Texture X offset (m)
                - textbox "Texture X offset (m)" [ref=e123]: "0"
              - group [ref=e124]:
                - generic [ref=e125]: Texture Y offset (m)
                - textbox "Texture Y offset (m)" [ref=e126]: "0"
              - button "Reset tiling" [ref=e127]
              - generic [ref=e128] [cursor=pointer]:
                - checkbox "Apply to connected matching surfaces" [ref=e129]
                - text: Apply to connected matching surfaces
              - button "Set this surface start as closure seam" [ref=e130]
              - paragraph [ref=e131]: Physical tile size is preserved. Closed paths retain a designated seam.
              - paragraph [ref=e132]: "Texture follows the visible boundary, including concave T corners. Route: Wall 4 A → Wall 3 A → Wall 2 A → Wall 1 A"
    - status [ref=e133]:
      - generic [ref=e134]: Click a start point. Right drag rotates, Shift + right drag pans.
      - generic [ref=e135]: 1 / Metres
  - tooltip [ref=e137]
```

# Test source

```ts
  1  | import {test,expect,type Page,type Locator} from '@playwright/test';
  2  | import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
  3  | import type {ProjectDocument} from '@building/editor-core';
  4  | import type {ThreeRuntime} from '@building/three-runtime';
  5  | 
  6  | type Probe={__editor:{document():ProjectDocument;diagnostics():ReturnType<ThreeRuntime['diagnostics']>}};
  7  | const documentOf=(page:Page)=>page.evaluate(()=>(window as unknown as Probe).__editor.document());
  8  | const diagnostic=(page:Page)=>page.evaluate(()=>(window as unknown as Probe).__editor.diagnostics());
  9  | const tokenSource=JSON.parse(readFileSync('packages/ui/src/tokens/source.json','utf8')) as Record<'light'|'dark',Record<string,string>>;
  10 | const appSource=readFileSync('apps/desktop/src/App.tsx','utf8')+readFileSync('apps/desktop/src/ui/Inspector.tsx','utf8');
  11 | const customTooltipUsed=/<Tooltip(?:Trigger|Content|\s|>)/.test(appSource);
  12 | const toastUsed=/\b(?:toast\(|<Toaster\b|<Toast\b)/.test(appSource);
  13 | const labels={
  14 |  'zh-CN':{settings:'设置',appearance:'外观',language:'语言',light:'亮色',dark:'暗色',system:'跟随系统',close:'关闭',redo:'重做',example:'可编辑示例',wall:'墙体 1',length:'轴线长度（m）',error:'操作失败',dismiss:'关闭提示',surface:'表面',sideB:'B 面',image:'图片',plaster:'墙面',save:'保存',saved:'工程已保存',addLevel:'新增楼层',select:'选择'},
  15 |  en:{settings:'Settings',appearance:'Appearance',language:'Language',light:'Light',dark:'Dark',system:'Follow system',close:'Close',redo:'Redo',example:'Editable example',wall:'Wall 1',length:'Axis length (m)',error:'Operation failed',dismiss:'Dismiss',surface:'Surface',sideB:'Side B',image:'Image',plaster:'Plaster',save:'Save',saved:'Project saved',addLevel:'Add level',select:'Select'}
  16 | };
  17 | async function choose(page:Page,label:string,value:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
  18 | function record(name:string,details:unknown){const path='tests/artifacts/ui-states-validation.json';mkdirSync('tests/artifacts',{recursive:true});const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{scope:'Windows Chromium/SwiftShader browser production UI only. No Tauri/native GUI/macOS or native tooltip visual acceptance.',runs:[]};previous.runs.push({name,status:'passed',measuredAt:new Date().toISOString(),details});writeFileSync(path,JSON.stringify(previous,null,2));}
  19 | async function style(locator:Locator){return locator.evaluate(element=>{const s=getComputedStyle(element);const pixel=(color:string)=>{
  20 |  // Use a fresh surface, matching expectedPixel. Chromium GPU surface reuse can round translucent color-mix channels differently after an opaque draw.
  21 |  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);
  22 |  };const ring=s.getPropertyValue('--tw-ring-color');return{color:s.color,background:s.backgroundColor,border:s.borderColor,boxShadow:s.boxShadow,outline:s.outline,outlineColor:s.outlineColor,outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle,fill:s.fill,opacity:s.opacity,pointerEvents:s.pointerEvents,focusVisible:element.matches(':focus-visible'),colorRGBA:pixel(s.color),backgroundRGBA:pixel(s.backgroundColor),borderRGBA:pixel(s.borderColor),outlineRGBA:pixel(s.outlineColor),fillRGBA:pixel(s.fill),ring,ringRGBA:ring?pixel(ring):null,portalOutsideRoot:!document.querySelector('#root')!.contains(element)};});}
  23 | async function expectedPixel(page:Page,color:string){return page.evaluate(color=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);},color);}
  24 | async function semantic(page:Page,locator:Locator,property:'backgroundRGBA'|'colorRGBA'|'borderRGBA'|'ringRGBA'|'outlineRGBA'|'fillRGBA',value:string){const expected=await expectedPixel(page,value);await expect.poll(async()=>(await style(locator))[property]).toEqual(expected);await locator.evaluate(async element=>{await Promise.allSettled(element.getAnimations().map(animation=>animation.finished));});return style(locator);}
  25 | async function layout(page:Page){return page.evaluate(()=>{const root=document.documentElement;const selectors=['.editor','.main-toolbar','.file-actions','.tools-bar','.work-area','.viewport-region','.floors','.inspector','[data-slot="dialog-content"]','[data-slot="select-content"]','[data-slot="tooltip-content"]'];return{viewport:{width:innerWidth,height:innerHeight},document:{scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,scrollHeight:root.scrollHeight,clientHeight:root.clientHeight},elements:selectors.flatMap(selector=>Array.from(document.querySelectorAll<HTMLElement>(selector)).map(element=>{const r=element.getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};}))};});}
  26 | async function noOverflow(page:Page){const result=await layout(page);expect(result.document.scrollWidth).toBeLessThanOrEqual(result.viewport.width+1);expect(result.document.scrollHeight).toBeLessThanOrEqual(result.viewport.height+1);for(const element of result.elements){expect(element.x,element.selector).toBeGreaterThanOrEqual(-1);expect(element.x+element.width,element.selector).toBeLessThanOrEqual(result.viewport.width+1);expect(element.scrollWidth,element.selector).toBeLessThanOrEqual(element.clientWidth+1);}return result;}
  27 | test.beforeEach(async({page})=>{await page.setViewportSize({width:900,height:600});await page.goto('/');await page.waitForFunction(()=>!!(window as unknown as Probe).__editor);await expect(page.locator('canvas')).toHaveCount(1);});
  28 | 
  29 | for(const language of ['zh-CN','en'] as const)for(const theme of ['light','dark'] as const){
  30 |  test(`A35 ${language}/${theme} actual portals, errors, disabled/focus states and compact layout`,async({page},testInfo)=>{
  31 |   const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const t=labels[language],palette=tokenSource[theme];
  32 |   await page.getByRole('button',{name:'设置',exact:true}).click();if(language==='en')await choose(page,'语言','English');await choose(page,t.appearance,t[theme]);await page.getByRole('button',{name:t.close,exact:true}).click();
  33 |   await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  34 |   await page.getByRole('button',{name:t.example,exact:true}).click();await page.getByRole('button',{name:t.wall,exact:true}).click();const baseline=await documentOf(page),renderer=(await diagnostic(page)).rendererId;
  35 |   const toolbar=await semantic(page,page.locator('.main-toolbar'),'backgroundRGBA',palette.card!);const sidebar=await semantic(page,page.locator('.inspector'),'backgroundRGBA',palette.sidebar!);
  36 |   const redo=page.getByRole('button',{name:t.redo,exact:true});await expect(redo).toBeDisabled();const disabled=await style(redo);expect(Number(disabled.opacity)).toBe(.5);expect(disabled.pointerEvents).toBe('none');
  37 |   const titleHint=page.getByRole('button',{name:t.addLevel,exact:true});expect(await titleHint.getAttribute('title')).toBeNull();expect(customTooltipUsed).toBe(true);expect(toastUsed).toBe(false);
  38 |   await titleHint.hover();const tooltip=page.locator('[data-slot="tooltip-content"]');await expect(tooltip).toBeVisible();await expect(page.getByRole('tooltip',{name:t.addLevel,exact:true})).toHaveCount(1);
  39 |   const tooltipHover=await semantic(page,tooltip,'backgroundRGBA',palette.foreground!);await semantic(page,tooltip,'colorRGBA',palette.background!);expect(tooltipHover.portalOutsideRoot).toBe(true);const tooltipArrow=await semantic(page,tooltip.locator('svg'),'fillRGBA',palette.foreground!);const tooltipLayout=await noOverflow(page);await page.screenshot({path:`${testInfo.outputDir}/tooltip-${language}-${theme}-900x600.png`});
> 40 |   await page.mouse.move(850,580);await expect(tooltip).toHaveCount(0);await page.locator('.floor-list button').first().click();await page.locator('.floor-list button').first().press('Shift+Tab');await expect(titleHint).toBeFocused();await expect(tooltip).toBeVisible();const tooltipKeyboard=await semantic(page,tooltip,'backgroundRGBA',palette.foreground!);const tooltipTriggerFocus=await semantic(page,titleHint,'ringRGBA',`color-mix(in oklab, ${palette.ring} 50%, transparent)`);expect(tooltipTriggerFocus.focusVisible).toBe(true);await titleHint.press('Escape');await expect(tooltip).toHaveCount(0);await page.getByRole('button',{name:t.wall,exact:true}).click();
     |                                                        ^ Error: expect(locator).toHaveCount(expected) failed
  41 |   await page.getByRole('button',{name:t.settings,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:t.settings,exact:true})).toBeVisible();
  42 |   const dialogColor=await semantic(page,dialog,'backgroundRGBA',palette.background!);expect(dialogColor.portalOutsideRoot).toBe(true);
  43 |   const overlay=await semantic(page,page.locator('[data-slot="dialog-overlay"]'),'backgroundRGBA',palette.overlay!);
  44 |   await page.getByRole('combobox',{name:t.appearance,exact:true}).click();const menu=page.getByRole('listbox');await expect(menu).toBeVisible();await expect(page.getByRole('option')).toHaveText([t.system,t.light,t.dark]);
  45 |   const menuColor=await semantic(page,menu,'backgroundRGBA',palette.popover!);await semantic(page,menu,'colorRGBA',palette['popover-foreground']!);expect(menuColor.portalOutsideRoot).toBe(true);
  46 |   await page.keyboard.press('ArrowUp');const highlighted=page.locator('[data-slot="select-item"][data-highlighted]');await expect(highlighted).toHaveCount(1);const optionColor=await semantic(page,highlighted,'backgroundRGBA',palette.accent!);await semantic(page,highlighted,'colorRGBA',palette['accent-foreground']!);
  47 |   const portalLayout=await noOverflow(page);await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
  48 |   const focusTrap:boolean[]=[];for(let index=0;index<7;index++){await page.keyboard.press('Tab');focusTrap.push(await dialog.evaluate(element=>element.contains(document.activeElement)));}expect(focusTrap.every(Boolean)).toBe(true);
  49 |   await page.keyboard.press('Delete');expect(await documentOf(page)).toEqual(baseline);await page.getByRole('button',{name:t.close,exact:true}).click();await expect(dialog).toHaveCount(0);
  50 |   const input=page.getByLabel(t.length,{exact:true});await input.click();await input.press('Tab');await page.keyboard.press('Shift+Tab');await semantic(page,input,'borderRGBA',palette.ring!);const validFocus=await semantic(page,input,'ringRGBA',`color-mix(in oklab, ${palette.ring} 50%, transparent)`);expect(validFocus.focusVisible).toBe(true);expect(validFocus.boxShadow).not.toBe('none');
  51 |   await input.fill('-');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await semantic(page,input,'borderRGBA',palette.destructive!);const invalidFocus=await semantic(page,input,'ringRGBA',`color-mix(in oklab, ${palette.destructive} ${theme==='dark'?40:20}%, transparent)`);expect(invalidFocus.focusVisible).toBe(true);expect(invalidFocus.boxShadow).not.toBe('none');expect(await documentOf(page)).toEqual(baseline);
  52 |   await input.fill('0');await input.press('Enter');const alert=page.getByRole('alert');await expect(alert).toBeVisible();await expect(alert.locator('[data-slot="alert-title"]')).toHaveText(t.error);const errorText=(await alert.locator('[data-slot="alert-description"]').innerText()).trim();expect(errorText.length).toBeGreaterThan(t.dismiss.length+8);expect(errorText).not.toContain('undefined');expect(errorText).not.toContain('wall.invalid');
  53 |   const alertColor=await semantic(page,alert,'colorRGBA',palette.destructive!);await semantic(page,alert,'backgroundRGBA',palette.card!);const errorLayout=await noOverflow(page);await input.press('Escape');await page.getByRole('button',{name:t.dismiss,exact:true}).click();await expect(alert).toHaveCount(0);
  54 |   await page.getByRole('combobox',{name:t.surface,exact:true}).click();await expect(page.getByRole('option',{name:t.sideB,exact:true})).toBeVisible();await page.getByRole('option',{name:t.sideB,exact:true}).click();await page.getByRole('combobox',{name:t.image,exact:true}).click();await expect(page.getByRole('option',{name:t.plaster,exact:true})).toBeVisible();const materialMenuColor=await semantic(page,page.getByRole('listbox'),'backgroundRGBA',palette.popover!);await page.keyboard.press('Escape');
  55 |   const download=page.waitForEvent('download');await page.getByRole('button',{name:t.save,exact:true}).click();const savedFile=await download;await expect(page.getByRole('status')).toContainText(t.saved);const statusColor=await semantic(page,page.getByRole('status'),'colorRGBA',palette['muted-foreground']!);
  56 |   await page.getByRole('button',{name:t.settings,exact:true}).click();await page.getByRole('button',{name:t.close,exact:true}).click();const projectLabel=page.locator('.project-label [data-slot="tooltip-trigger"]');for(let index=0;index<15&&!await projectLabel.evaluate(element=>element===document.activeElement);index++)await page.keyboard.press('Shift+Tab');await expect(projectLabel).toBeFocused();const projectLabelFocus=await semantic(page,projectLabel,'outlineRGBA',palette.ring!);expect(projectLabelFocus.focusVisible).toBe(true);expect(projectLabelFocus.outlineWidth).toBe('2px');await expect(tooltip).toBeVisible();await expect(page.getByRole('tooltip')).toHaveText(savedFile.suggestedFilename());const projectTooltip=await semantic(page,tooltip,'backgroundRGBA',palette.foreground!);await semantic(page,tooltip,'colorRGBA',palette.background!);await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
  57 |   const commonLayout=await noOverflow(page);const visibleUi=await page.locator('.file-actions button,.tools-bar [role="radio"],.inspector h2').allTextContents();expect(visibleUi.join(' ')).not.toMatch(/undefined|__unknown|hint[A-Z]|settingsFailure/);if(language==='en')expect(visibleUi.join(' ')).not.toMatch(/[\u3400-\u9fff]/);else expect(visibleUi).toEqual(expect.arrayContaining(['保存','选择','墙体','属性']));
  58 |   expect(await documentOf(page)).toEqual(baseline);expect((await diagnostic(page)).rendererId).toBe(renderer);expect(errors).toEqual([]);
  59 |   await page.screenshot({path:`${testInfo.outputDir}/ui-${language}-${theme}-900x600.png`});
  60 |   record(`A35 ${language}/${theme}`,{viewport:{width:900,height:600},actualUiText:visibleUi,errorText,computedColors:{toolbar,sidebar,dialog:dialogColor,overlay,menu:menuColor,option:optionColor,materialMenu:materialMenuColor,disabled,validFocus,invalidFocus,alert:alertColor,status:statusColor,tooltipHover,tooltipKeyboard,tooltipArrow,tooltipTriggerFocus,projectTooltip,projectLabelFocus},focusTrap,layouts:{portal:portalLayout,tooltip:tooltipLayout,error:errorLayout,common:commonLayout},tooltip:{customTooltipUsed,localizedText:t.addLevel,keyboardFocus:true,savedProjectPath:savedFile.suggestedFilename(),nativeTitleRemoved:true},notifications:{toastUsed,production:'status footer and inline error Alert'},errors});
  61 |  });
  62 | }
  63 | 
  64 | test('system media changes keep uncommitted invalid numeric draft, keyboard focus, camera and selection',async({page})=>{
  65 |  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.getByRole('button',{name:'可编辑示例',exact:true}).click();await page.getByRole('button',{name:'墙体 1',exact:true}).click();await page.getByRole('button',{name:'查看整栋',exact:true}).click();
  66 |  const input=page.getByLabel('轴线长度（m）',{exact:true});await input.fill('-');const draftDoc=await documentOf(page),before=await diagnostic(page);await expect(input).toBeFocused();await expect(input).toHaveValue('-');await expect(input).toHaveAttribute('aria-invalid','false');await expect(page.getByRole('button',{name:'墙体 1',exact:true})).toHaveAttribute('data-variant','secondary');
  67 |  const readings=[];for(const colorScheme of ['dark','light','dark'] as const){await page.emulateMedia({colorScheme});await expect(page.locator('html')).toHaveAttribute('data-theme',colorScheme);await expect(input).toBeFocused();await expect(input).toHaveValue('-');await expect(input).toHaveAttribute('aria-invalid','false');await expect(page.getByRole('button',{name:'墙体 1',exact:true})).toHaveAttribute('data-variant','secondary');const after=await diagnostic(page);expect(after.rendererId).toBe(before.rendererId);expect(after.camera).toEqual(before.camera);expect(await documentOf(page)).toEqual(draftDoc);readings.push({colorScheme,rendererId:after.rendererId,camera:after.camera,value:await input.inputValue(),stillFocused:await input.evaluate(element=>element===document.activeElement)});}
  68 |  record('system-media-uncommitted-draft',{scope:'Chromium matchMedia emulation, not Windows/macOS OS theme change',uncommittedDraft:'-',noBlurOrCommitBeforeAndDuringTransitions:true,selection:'Wall 1 retained',readings});
  69 | });
  70 | 
```