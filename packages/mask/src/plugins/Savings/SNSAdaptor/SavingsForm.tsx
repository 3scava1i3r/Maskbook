import { unreachable } from '@dimensiondev/kit'
import { FormattedCurrency, LoadingAnimation, TokenAmountPanel, TokenIcon, useOpenShareTxDialog } from '@masknet/shared'
import { useRemoteControlledDialog } from '@masknet/shared-base-ui'
import AaveLendingPoolAddressProviderABI from '@masknet/web3-contracts/abis/AaveLendingPoolAddressProvider.json'
import type { AaveLendingPoolAddressProvider } from '@masknet/web3-contracts/types/AaveLendingPoolAddressProvider'
import { isLessThan, rightShift } from '@masknet/web3-shared-base'
import {
    createContract,
    createERC20Token,
    createLookupTableResolver,
    EthereumTokenType,
    formatBalance,
    formatCurrency,
    getAaveConstants,
    isSameAddress,
    useAccount,
    useFungibleTokenBalance,
    useTokenConstants,
    useWeb3,
    ZERO_ADDRESS,
} from '@masknet/web3-shared-evm'
import { Typography } from '@mui/material'
import BigNumber from 'bignumber.js'
import { useCallback, useMemo, useState } from 'react'
import { useAsync, useAsyncFn } from 'react-use'
import type { AbiItem } from 'web3-utils'
import { ActionButtonPromise } from '../../../extension/options-page/DashboardComponents/ActionButton'
import { activatedSocialNetworkUI } from '../../../social-network'
import { isFacebook } from '../../../social-network-adaptor/facebook.com/base'
import { isTwitter } from '../../../social-network-adaptor/twitter.com/base'
import { useI18N } from '../../../utils'
import { EthereumChainBoundary } from '../../../web3/UI/EthereumChainBoundary'
import { EthereumERC20TokenApprovedBoundary } from '../../../web3/UI/EthereumERC20TokenApprovedBoundary'
import { EthereumWalletConnectedBoundary } from '../../../web3/UI/EthereumWalletConnectedBoundary'
import { PluginTraderMessages } from '../../Trader/messages'
import type { Coin } from '../../Trader/types'
import { useTokenPrice } from '../../Wallet/hooks/useTokenPrice'
import { ProtocolType, SavingsProtocol, TabType } from '../types'
import { useStyles } from './SavingsFormStyles'

export interface SavingsFormProps {
    chainId: number
    protocol: SavingsProtocol
    tab: TabType
    onClose?: () => void
}

export const resolveProtocolName = createLookupTableResolver<ProtocolType, string>(
    {
        [ProtocolType.Lido]: 'Lido',
        [ProtocolType.AAVE]: 'AAVE',
    },
    'unknown',
)

export function SavingsForm({ chainId, protocol, tab, onClose }: SavingsFormProps) {
    const { t } = useI18N()
    const { classes } = useStyles()

    const web3 = useWeb3({ chainId })
    const account = useAccount()
    const { NATIVE_TOKEN_ADDRESS } = useTokenConstants()
    const [inputAmount, setInputAmount] = useState('')
    const [estimatedGas, setEstimatedGas] = useState<BigNumber.Value>(new BigNumber('0'))

    const { value: nativeTokenBalance } = useFungibleTokenBalance(EthereumTokenType.Native, '', chainId)

    const { setDialog: openSwapDialog } = useRemoteControlledDialog(PluginTraderMessages.swapDialogUpdated)

    const onConvertClick = useCallback(() => {
        const token = protocol.stakeToken
        openSwapDialog({
            open: true,
            traderProps: {
                defaultInputCoin: {
                    id: token.address,
                    name: token.name ?? '',
                    symbol: token.symbol ?? '',
                    contract_address: token.address,
                    decimals: token.decimals,
                } as Coin,
            },
        })
    }, [protocol, openSwapDialog])

    // #region form variables
    const { value: inputTokenBalance } = useFungibleTokenBalance(
        isSameAddress(protocol.bareToken.address, NATIVE_TOKEN_ADDRESS)
            ? EthereumTokenType.Native
            : protocol.bareToken.type ?? EthereumTokenType.Native,
        protocol.bareToken.address,
        chainId,
    )
    const tokenAmount = useMemo(
        () => new BigNumber(rightShift(inputAmount || '0', protocol.bareToken.decimals)),
        [inputAmount, protocol.bareToken.decimals],
    )
    const balanceAsBN = useMemo(
        () => (tab === TabType.Deposit ? new BigNumber(inputTokenBalance || '0') : protocol.balance),
        [tab, protocol.balance, inputTokenBalance],
    )

    const { loading } = useAsync(async () => {
        if (!(tokenAmount.toNumber() > 0)) return
        try {
            setEstimatedGas(
                tab === TabType.Deposit
                    ? await protocol.depositEstimate(account, chainId, web3, tokenAmount)
                    : await protocol.withdrawEstimate(account, chainId, web3, tokenAmount),
            )
        } catch {
            // do nothing
            console.log('Failed to estimate gas')
        }
    }, [chainId, tab, protocol, tokenAmount])
    // #endregion

    // #region form validation
    const validationMessage = useMemo(() => {
        if (tokenAmount.isZero() || !inputAmount) return t('plugin_trader_error_amount_absence')
        if (isLessThan(tokenAmount, 0)) return t('plugin_trade_error_input_amount_less_minimum_amount')

        if (isLessThan(balanceAsBN.minus(estimatedGas), tokenAmount)) {
            return t('plugin_trader_error_insufficient_balance', {
                symbol: tab === TabType.Deposit ? protocol.bareToken.symbol : protocol.stakeToken.symbol,
            })
        }

        return ''
    }, [inputAmount, tokenAmount, nativeTokenBalance, balanceAsBN])

    const tokenPrice = useTokenPrice(
        chainId,
        !isSameAddress(protocol.bareToken.address, NATIVE_TOKEN_ADDRESS) ? protocol.bareToken.address : undefined,
    )

    const tokenValueUSD = useMemo(
        () => (inputAmount ? new BigNumber(inputAmount).times(tokenPrice).toFixed(2) : '0'),
        [inputAmount, tokenPrice],
    )
    // #endregion

    const { value: approvalData } = useAsync(async () => {
        const token = protocol.bareToken
        const aavePoolAddress =
            getAaveConstants(chainId).AAVE_LENDING_POOL_ADDRESSES_PROVIDER_CONTRACT_ADDRESS || ZERO_ADDRESS

        const lPoolAddressProviderContract = createContract<AaveLendingPoolAddressProvider>(
            web3,
            aavePoolAddress,
            AaveLendingPoolAddressProviderABI as AbiItem[],
        )

        const poolAddress = await lPoolAddressProviderContract?.methods.getLendingPool().call()

        return {
            approveToken:
                token.type === EthereumTokenType.ERC20
                    ? createERC20Token(chainId, token.address, token.decimals, token.name, token.symbol)
                    : undefined,
            approveAmount: new BigNumber(inputAmount).shiftedBy(token.decimals),
            approveAddress: poolAddress,
        }
    }, [protocol.bareToken, inputAmount, chainId])

    const openShareTxDialog = useOpenShareTxDialog()
    const shareText = [
        `I just deposit ${inputAmount} ${protocol.bareToken.symbol} with ${resolveProtocolName(protocol.type)}. ${
            isTwitter(activatedSocialNetworkUI) || isFacebook(activatedSocialNetworkUI)
                ? `Follow @${
                      isTwitter(activatedSocialNetworkUI) ? t('twitter_account') : t('facebook_account')
                  } (mask.io) to deposit.`
                : ''
        }`,
        '#mask_io',
    ].join('\n')
    const [, executor] = useAsyncFn(async () => {
        switch (tab) {
            case TabType.Deposit:
                const hash = await protocol.deposit(account, chainId, web3, tokenAmount)
                if (typeof hash !== 'string') {
                    throw new Error('Failed to deposit token.')
                } else {
                    await protocol.updateBalance(chainId, web3, account)
                }
                openShareTxDialog({
                    hash,
                    onShare() {
                        activatedSocialNetworkUI.utils.share?.(shareText)
                    },
                })
                break
            case TabType.Withdraw:
                switch (protocol.type) {
                    case ProtocolType.Lido:
                        onClose?.()
                        onConvertClick()
                        return
                    default:
                        if (!(await protocol.withdraw(account, chainId, web3, tokenAmount))) {
                            throw new Error('Failed to withdraw token.')
                        } else {
                            await protocol.updateBalance(chainId, web3, account)
                        }
                        return
                }
            default:
                unreachable(tab)
        }
    }, [tab, protocol, account, chainId, web3, tokenAmount, openShareTxDialog])

    const needsSwap = protocol.type === ProtocolType.Lido && tab === TabType.Withdraw

    const buttonDom = useMemo(() => {
        if (tab === TabType.Deposit)
            return (
                <EthereumChainBoundary
                    chainId={chainId}
                    noSwitchNetworkTip
                    disablePadding
                    ActionButtonPromiseProps={{
                        fullWidth: true,
                        classes: { root: classes.button, disabled: classes.disabledButton },
                        color: 'primary',
                        style: { padding: '13px 0', marginTop: 0 },
                    }}>
                    <EthereumWalletConnectedBoundary
                        ActionButtonProps={{ color: 'primary', classes: { root: classes.button } }}
                        classes={{ connectWallet: classes.connectWallet, button: classes.button }}>
                        <EthereumERC20TokenApprovedBoundary
                            amount={approvalData?.approveAmount.toFixed() ?? ''}
                            token={approvalData?.approveToken}
                            spender={approvalData?.approveAddress}>
                            <ActionButtonPromise
                                fullWidth
                                color="primary"
                                size="large"
                                variant="contained"
                                init={
                                    needsSwap
                                        ? 'Swap ' + protocol.bareToken.symbol
                                        : validationMessage ||
                                          t('plugin_savings_deposit') + ' ' + protocol.bareToken.symbol
                                }
                                waiting={t('plugin_savings_process_deposit')}
                                failed={t('failed')}
                                failedOnClick="use executor"
                                complete={t('done')}
                                disabled={validationMessage !== '' && !needsSwap}
                                noUpdateEffect
                                executor={executor}
                            />
                        </EthereumERC20TokenApprovedBoundary>
                    </EthereumWalletConnectedBoundary>
                </EthereumChainBoundary>
            )

        return (
            <EthereumChainBoundary
                chainId={chainId}
                noSwitchNetworkTip
                disablePadding
                ActionButtonPromiseProps={{
                    fullWidth: true,
                    classes: { root: classes.button, disabled: classes.disabledButton },
                    color: 'primary',
                    style: { padding: '13px 0', marginTop: 0 },
                }}>
                <EthereumWalletConnectedBoundary
                    ActionButtonProps={{ color: 'primary', classes: { root: classes.button } }}
                    classes={{ connectWallet: classes.connectWallet, button: classes.button }}>
                    <ActionButtonPromise
                        fullWidth
                        color="primary"
                        size="large"
                        variant="contained"
                        init={validationMessage || t('plugin_savings_withdraw') + ' ' + protocol.stakeToken.symbol}
                        waiting={t('plugin_savings_process_withdraw')}
                        failed={t('failed')}
                        failedOnClick="use executor"
                        complete={t('done')}
                        disabled={validationMessage !== ''}
                        noUpdateEffect
                        executor={executor}
                    />
                </EthereumWalletConnectedBoundary>
            </EthereumChainBoundary>
        )
    }, [executor, validationMessage, needsSwap, protocol, tab, approvalData, chainId])

    return (
        <div className={classes.containerWrap}>
            {needsSwap ? null : (
                <>
                    <div className={classes.inputWrap}>
                        <TokenAmountPanel
                            amount={inputAmount}
                            maxAmount={balanceAsBN.minus(estimatedGas).toString()}
                            balance={balanceAsBN.toString()}
                            label={t('plugin_savings_amount')}
                            token={protocol.bareToken}
                            onAmountChange={setInputAmount}
                            InputProps={{ classes: { root: classes.inputTextField } }}
                            MaxChipProps={{ classes: { root: classes.maxChip } }}
                            SelectTokenChip={{ ChipProps: { classes: { root: classes.selectTokenChip } } }}
                        />
                    </div>

                    {loading ? (
                        <Typography variant="body2" textAlign="right" className={classes.tokenValueUSD}>
                            <LoadingAnimation width={16} height={16} />
                        </Typography>
                    ) : (
                        <Typography variant="body2" textAlign="right" className={classes.tokenValueUSD}>
                            &asymp; <FormattedCurrency value={tokenValueUSD} sign="$" formatter={formatCurrency} />
                            {estimatedGas > 0 ? (
                                <span className={classes.gasFee}>+ {formatBalance(estimatedGas, 18)} ETH</span>
                            ) : (
                                <span />
                            )}
                        </Typography>
                    )}
                </>
            )}

            <div className={classes.infoRow}>
                <Typography variant="body2" className={classes.infoRowLeft}>
                    <TokenIcon address={protocol.bareToken.address} classes={{ icon: classes.rowImage }} />
                    {protocol.bareToken.name} {t('plugin_savings_apr')}%
                </Typography>
                <Typography variant="body2" className={classes.infoRowRight}>
                    {protocol.apr}%
                </Typography>
            </div>
            {buttonDom}
        </div>
    )
}
