import './styles.css'
import type { Settings } from '@shared/types'
import { Pile } from './pile'
import { SettingsPanel } from './settings-panel'
import { Slideshow } from './slideshow'

const table = document.getElementById('table') as HTMLElement
const notice = document.getElementById('notice') as HTMLElement
const pausedBadge = document.getElementById('paused') as HTMLElement
const dialog = document.getElementById('settings') as HTMLDialogElement

async function boot(): Promise<void> {
  let settings: Settings = await window.photofall.getSettings()
  const applyLook = (): void => {
    document.body.classList.toggle('no-date', !settings.showDate)
  }
  applyLook()

  const pile = new Pile(table)
  const show = new Slideshow(pile, settings, {
    onNotice(html) {
      if (html === null) {
        notice.hidden = true
        notice.innerHTML = ''
        return
      }
      notice.hidden = false
      notice.innerHTML = `<div>${html}</div>`
      if (!html.startsWith('Loading')) {
        const btn = document.createElement('button')
        btn.className = 'primary'
        btn.textContent = 'Choose a folder'
        btn.addEventListener('click', () => panel.open(settings))
        notice.appendChild(btn)
      }
    },
    onPausedChange(paused) {
      pausedBadge.hidden = !paused
    }
  })

  const panel = new SettingsPanel(dialog, {
    onOpen: () => show.hold(true),
    onClose: () => show.hold(false),
    async onSave(next, prev) {
      settings = await window.photofall.setSettings(next)
      show.updateSettings(settings)
      applyLook()
      const folderChanged =
        settings.sourceFolder !== prev.sourceFolder || settings.includeSubfolders !== prev.includeSubfolders
      const orderChanged = settings.sortBy !== prev.sortBy || settings.sortOrder !== prev.sortOrder
      if (folderChanged) pile.clear()
      if (folderChanged || orderChanged) await show.restart(folderChanged)
    }
  })

  window.addEventListener('keydown', (e) => {
    if (panel.isOpen) return
    if (e.key === ' ') {
      e.preventDefault()
      show.togglePause()
    } else if (e.key === 'ArrowRight') {
      show.next()
    } else if (e.key === ',' && !e.metaKey) {
      panel.open(settings)
    } else if (e.key === 'Escape') {
      void window.photofall.exitFullscreen()
    }
  })
  window.photofall.onOpenSettings(() => panel.open(settings))
  window.photofall.onTogglePause(() => show.togglePause())
  window.photofall.onNext(() => show.next())
  window.photofall.onClear(() => pile.clear())

  // Hide the cursor after 2 s without movement.
  let idle: ReturnType<typeof setTimeout> | undefined
  const wake = (): void => {
    document.body.classList.remove('hide-cursor')
    clearTimeout(idle)
    idle = setTimeout(() => {
      if (!panel.isOpen) document.body.classList.add('hide-cursor')
    }, 2000)
  }
  window.addEventListener('mousemove', wake)
  wake()

  await show.restart()
}

void boot()
