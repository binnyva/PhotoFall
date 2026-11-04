import type { Settings, SortBy } from '@shared/types'

const SORT_LABELS: Record<SortBy, string> = {
  exifDate: 'Date taken (EXIF)',
  createdDate: 'File created date',
  name: 'File name',
  random: 'Random'
}

export interface SettingsPanelHooks {
  onOpen(): void
  onClose(): void
  onSave(next: Settings, prev: Settings): void
}

/** The settings dialog shown over the slideshow. Changes apply when you press Save. */
export class SettingsPanel {
  private draft: Settings | null = null
  private current: Settings | null = null

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly hooks: SettingsPanelHooks
  ) {
    dialog.addEventListener('close', () => this.hooks.onClose())
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault()
      this.close()
    })
  }

  get isOpen(): boolean {
    return this.dialog.open
  }

  open(current: Settings): void {
    if (this.dialog.open) return
    this.current = current
    this.draft = { ...current }
    this.render()
    this.hooks.onOpen()
    this.dialog.showModal()
    document.body.classList.remove('hide-cursor')
  }

  close(): void {
    if (this.dialog.open) this.dialog.close()
  }

  private render(): void {
    const d = this.draft as Settings
    const opts = (Object.keys(SORT_LABELS) as SortBy[])
      .map((k) => `<option value="${k}" ${d.sortBy === k ? 'selected' : ''}>${SORT_LABELS[k]}</option>`)
      .join('')
    this.dialog.innerHTML = `
      <form method="dialog">
        <h2>PhotoFall settings</h2>
        <div class="field">
          <span>Source folder</span>
          <div class="folder"><code id="pf-folder"></code><button type="button" id="pf-choose">Choose…</button></div>
        </div>
        <label class="field">
          <span>Delay</span>
          <input id="pf-delay" type="number" min="1" max="600" step="1" value="${d.delaySeconds}" />
        </label>
        <label class="field">
          <span>Sort by</span>
          <select id="pf-sort">${opts}</select>
        </label>
        <label class="field">
          <span>Order</span>
          <select id="pf-order" ${d.sortBy === 'random' ? 'disabled' : ''}>
            <option value="asc" ${d.sortOrder === 'asc' ? 'selected' : ''}>Oldest / A to Z first</option>
            <option value="desc" ${d.sortOrder === 'desc' ? 'selected' : ''}>Newest / Z to A first</option>
          </select>
        </label>
        <div class="field">
          <span>Options</span>
          <div class="checks">
            <label><input id="pf-subfolders" type="checkbox" ${d.includeSubfolders ? 'checked' : ''}/> Include subfolders</label>
            <label><input id="pf-date" type="checkbox" ${d.showDate ? 'checked' : ''}/> Show date on photos</label>
            <label><input id="pf-sound" type="checkbox" ${d.videoSound ? 'checked' : ''}/> Play video sound</label>
            <label><input id="pf-resume" type="checkbox" ${d.resumeLastShown ? 'checked' : ''}/> Start from the last shown photo</label>
          </div>
        </div>
        <div class="actions">
          <span class="keys">Space pause · → next · Esc exit full screen</span>
          <div class="buttons">
            <button type="button" id="pf-cancel">Cancel</button>
            <button type="submit" class="primary" id="pf-save">Save</button>
          </div>
        </div>
      </form>`
    const $ = <T extends HTMLElement>(id: string): T => this.dialog.querySelector(`#${id}`) as T
    $('pf-folder').textContent = d.sourceFolder
    $('pf-folder').title = d.sourceFolder
    $('pf-choose').addEventListener('click', async () => {
      const folder = await window.photofall.chooseFolder()
      if (folder) {
        d.sourceFolder = folder
        $('pf-folder').textContent = folder
        $('pf-folder').title = folder
      }
    })
    $<HTMLSelectElement>('pf-sort').addEventListener('change', (e) => {
      $<HTMLSelectElement>('pf-order').disabled = (e.target as HTMLSelectElement).value === 'random'
    })
    $('pf-cancel').addEventListener('click', () => this.close())
    $('pf-save').addEventListener('click', (e) => {
      e.preventDefault()
      const delay = Number($<HTMLInputElement>('pf-delay').value)
      const next: Settings = {
        ...d,
        delaySeconds: Number.isFinite(delay) ? Math.min(600, Math.max(1, delay)) : d.delaySeconds,
        sortBy: $<HTMLSelectElement>('pf-sort').value as SortBy,
        sortOrder: $<HTMLSelectElement>('pf-order').value as Settings['sortOrder'],
        includeSubfolders: $<HTMLInputElement>('pf-subfolders').checked,
        showDate: $<HTMLInputElement>('pf-date').checked,
        videoSound: $<HTMLInputElement>('pf-sound').checked,
        resumeLastShown: $<HTMLInputElement>('pf-resume').checked
      }
      const prev = this.current as Settings
      this.close()
      this.hooks.onSave(next, prev)
    })
  }
}
