import { useState } from 'react'
import { Button, Tooltip, Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEnhancementController, type EnhanceButtonProps } from './EnhanceButton.tsx'
import { workflow } from './workflow.ts'

export type EnhanceLauncherProps = EnhanceButtonProps
export function EnhanceLauncher(props: EnhanceLauncherProps) {
  const { sessionId, t, openPanel } = props
  const { blocked, activity } = useEnhancementController(props)
  const [open, setOpen] = useState(false)
  const start = (mode: 'preview' | 'conditioned') => {
    setOpen(false)
    if (mode === 'preview') openPanel()
    void workflow.run(sessionId, mode)
  }
  return <span className="dsh-pe-control dsh-pe-launcher">
    <Tooltip label={blocked ? `${t('label')}：${t(blocked)}` : t('quickHint')} side="top" delayMs={400}>
      <span><Button size="sm" variant="ghost" className="dsh-pe-button" disabled={!!blocked || activity.busy}
        aria-label={t('label')} aria-busy={activity.busy} onMouseDown={event => event.preventDefault()}
        onClick={() => { void workflow.run(sessionId, 'quick') }}>
        {activity.busy ? <span className="dsh-pe-spinner" aria-hidden="true" /> : <svg viewBox="0 0 24 24" width="17" height="17"
          fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 20 12-12-3-3L1 17l3 3Zm6-12 3 3M18 2v4m-2-2h4M21 11v4m-2-2h4" />
        </svg>}
      </Button></span>
    </Tooltip>
    <Menu open={open} onClose={() => setOpen(false)} align="end" portal autoFocus compact
      anchor={<Button size="sm" variant="ghost" className="dsh-pe-menu-button" aria-label={t('moreOptions')}
        aria-haspopup="menu" aria-expanded={open} disabled={activity.busy}
        onClick={() => setOpen(value => !value)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg></Button>}>
      <MenuItemButton disabled={!!blocked} onSelect={() => start('preview')}>{t('previewFirst')}</MenuItemButton>
      <MenuItemButton disabled={!!blocked} onSelect={() => start('conditioned')}>{t('conditioned')}</MenuItemButton>
      <MenuItemButton onSelect={() => { setOpen(false); openPanel('checks') }}>{t('viewChecks')}</MenuItemButton>
    </Menu>
  </span>
}
