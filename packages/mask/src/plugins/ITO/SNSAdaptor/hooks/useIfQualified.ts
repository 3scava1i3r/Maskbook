import { useAsyncRetry } from 'react-use'
import { useAccount, useChainId } from '@masknet/web3-shared-evm'
import type { Qualification } from '@masknet/web3-contracts/types/Qualification'
import type { Qualification2 } from '@masknet/web3-contracts/types/Qualification2'
import { useQualificationContract } from './useQualificationContract'

export function useIfQualified(address: string, ito_address: string) {
    const account = useAccount()
    const chainId = useChainId()
    const { contract: qualificationContract, version } = useQualificationContract(address, ito_address)

    return useAsyncRetry(async () => {
        if (!qualificationContract) return false
        return (
            version === 1
                ? (qualificationContract as Qualification).methods.ifQualified(account)
                : (qualificationContract as Qualification2).methods.ifQualified(account, [])
        ).call({
            from: account,
        })
    }, [account, qualificationContract, chainId])
}
