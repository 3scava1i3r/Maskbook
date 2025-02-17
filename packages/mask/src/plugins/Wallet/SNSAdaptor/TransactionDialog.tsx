import { InjectedDialog } from '@masknet/shared'
import { useRemoteControlledDialog } from '@masknet/shared-base-ui'
import { makeStyles, useStylesExtends } from '@masknet/theme'
import {
    resolveTransactionLinkOnExplorer,
    TransactionState,
    TransactionStateType,
    useChainId,
} from '@masknet/web3-shared-evm'
import DoneIcon from '@mui/icons-material/Done'
import WarningIcon from '@mui/icons-material/Warning'
import { Button, CircularProgress, DialogActions, DialogContent, Link, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { activatedSocialNetworkUI } from '../../../social-network'
import { useI18N } from '../../../utils'
import { WalletMessages } from '../messages'

const useStyles = makeStyles()((theme) => ({
    content: {
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: theme.spacing(5, 3),
    },
    icon: {
        fontSize: 64,
        width: 64,
        height: 64,
    },
    link: {
        marginTop: theme.spacing(0.5),
    },
    primary: {
        fontSize: 18,
        marginTop: theme.spacing(1),
    },
    secondary: {
        fontSize: 14,
    },
}))

interface TransactionDialogUIProps extends withClasses<never> {}

function TransactionDialogUI(props: TransactionDialogUIProps) {
    const { t } = useI18N()
    const classes = useStylesExtends(useStyles(), props)

    const chainId = useChainId()

    // #region remote controlled dialog
    const [state, setState] = useState<TransactionState | null>(null)
    const [shareText, setShareText] = useState('')
    const [summary, setSummary] = useState('')
    const [title, setTitle] = useState(t('plugin_wallet_transaction'))
    const { open, closeDialog } = useRemoteControlledDialog(WalletMessages.events.transactionDialogUpdated, (ev) => {
        if (ev.open) {
            setState(ev.state)
            setSummary(ev.summary ?? '')
            setShareText(ev.shareText ?? '')
            setTitle(ev.title ?? t('plugin_wallet_transaction'))
        } else {
            setSummary('')
            setShareText('')
        }
    })
    const onShare = useCallback(() => {
        if (shareText) activatedSocialNetworkUI.utils.share?.(shareText)
        closeDialog()
    }, [shareText, closeDialog])
    // #endregion

    if (!state) return null
    return (
        <InjectedDialog open={open} onClose={closeDialog} title={title}>
            <DialogContent className={classes.content}>
                {state.type === TransactionStateType.WAIT_FOR_CONFIRMING ? (
                    <>
                        <CircularProgress size={64} color="primary" />
                        <Typography className={classes.primary} color="textPrimary" variant="subtitle1">
                            {t('plugin_wallet_transaction_wait_for_confirmation')}
                        </Typography>
                        <Typography className={classes.secondary} color="textSecondary">
                            {summary}
                        </Typography>
                    </>
                ) : null}
                {state.type === TransactionStateType.HASH ? (
                    <>
                        <DoneIcon className={classes.icon} />
                        <Typography className={classes.primary} color="textPrimary">
                            {t('plugin_wallet_transaction_submitted')}
                        </Typography>
                        <Typography>
                            <Link
                                className={classes.link}
                                href={resolveTransactionLinkOnExplorer(chainId, state.hash)}
                                target="_blank"
                                rel="noopener noreferrer">
                                {t('plugin_wallet_view_on_explorer')}
                            </Link>
                        </Typography>
                    </>
                ) : null}
                {state.type === TransactionStateType.CONFIRMED ? (
                    <>
                        {state.receipt.status ? (
                            <DoneIcon className={classes.icon} />
                        ) : (
                            <WarningIcon className={classes.icon} />
                        )}
                        <Typography className={classes.primary} color="textPrimary">
                            {state.receipt.status
                                ? t('plugin_wallet_transaction_confirmed')
                                : state.reason ?? t('plugin_wallet_transaction_reverted')}
                        </Typography>
                        <Typography>
                            <Link
                                className={classes.link}
                                href={resolveTransactionLinkOnExplorer(chainId, state.receipt.transactionHash)}
                                target="_blank"
                                rel="noopener noreferrer">
                                {t('plugin_wallet_view_on_explorer')}
                            </Link>
                        </Typography>
                    </>
                ) : null}
                {state.type === TransactionStateType.FAILED ? (
                    <>
                        <WarningIcon className={classes.icon} />
                        <Typography className={classes.primary} color="textPrimary">
                            {state.error.message}
                        </Typography>
                    </>
                ) : null}
            </DialogContent>
            {![TransactionStateType.UNKNOWN, TransactionStateType.WAIT_FOR_CONFIRMING].includes(state.type) ? (
                <DialogActions>
                    <Button
                        color="primary"
                        size="large"
                        variant="contained"
                        fullWidth
                        onClick={state.type === TransactionStateType.FAILED || !shareText ? closeDialog : onShare}>
                        {state.type === TransactionStateType.FAILED || !shareText ? t('dismiss') : t('share')}
                    </Button>
                </DialogActions>
            ) : null}
        </InjectedDialog>
    )
}

export interface TransactionDialogProps extends TransactionDialogUIProps {}

export function TransactionDialog(props: TransactionDialogProps) {
    return <TransactionDialogUI {...props} />
}
