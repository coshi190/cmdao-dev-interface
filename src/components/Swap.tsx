import React from "react"
import { useAccount, type Config } from "wagmi"
import { simulateContract, waitForTransactionReceipt, writeContract, readContract, readContracts } from '@wagmi/core'
import { erc20Abi, formatEther, parseEther } from "viem"
import { Token, BigintIsh } from "@uniswap/sdk-core"
import { TickMath, encodeSqrtRatioX96, Pool, Position } from "@uniswap/v3-sdk"
import { NonfungiblePositionManager, v3Factory, v3Pool, qouterV2, router02 } from "./abi"
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react"
import { ChevronDownIcon, ArrowDownIcon } from "@heroicons/react/20/solid"
import { useDebouncedCallback } from "use-debounce"

const tokens: {name: string, value: '0xstring', logo: string}[] = [
    { name: 'WJBC', value: '0xC4B7C87510675167643e3DE6EEeD4D2c06A9e747' as '0xstring', logo: 'https://gateway.commudao.xyz/ipfs/bafkreih6o2px5oqockhsuer7wktcvoky36gpdhv7qjwn76enblpce6uokq' },
    { name: 'JUSDT', value: '0x24599b658b57f91E7643f4F154B16bcd2884f9ac' as '0xstring', logo: 'https://gateway.commudao.xyz/ipfs/bafkreif3vllg6mwswlqypqgtsh7i7wwap7zgrkvtlhdjoc63zjm7uv6vvi' },
    { name: 'USDT (JBC Bridge)', value: '0xFD8Ef75c1cB00A594D02df48ADdc27414Bd07F8a' as '0xstring', logo: 'https://jibswap.com/images/tokens/USDT.png' },
    { name: 'BB', value: '0x8fcC6e3a23a0255057bfD9A97799b3a995Bf3D24' as '0xstring', logo: 'https://daobuddy.xyz/img/commuDao/token/BB.png' },
    { name: 'CMJ', value: '0xE67E280f5a354B4AcA15fA7f0ccbF667CF74F97b' as '0xstring', logo: 'https://gateway.commudao.xyz/ipfs/bafkreiabbtn5pc6di4nwfgpqkk3ss6njgzkt2evilc5i2r754pgiru5x4u' },
    { name: 'CMD-WOOD', value: '0x8652549D215E3c4e30fe33faa717a566E4f6f00C' as '0xstring', logo: 'https://gateway.commudao.xyz/ipfs/bafkreidldk7skx44xwstwat2evjyp4u5oy5nmamnrhurqtjapnwqzwccd4' },
    // can PR listing here
]
const V3_FACTORY = '0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7' as '0xstring'
const POSITION_MANAGER = '0xfC445018B20522F9cEd1350201e179555a7573A1' as '0xstring'
const QOUTER_V2 = '0x5ad32c64A2aEd381299061F32465A22B1f7A2EE2' as '0xstring'
const ROUTER02 = '0x2174b3346CCEdBB4Faaff5d8088ff60B74909A9d' as '0xstring'
const v3FactoryContract = { chainId: 8899, abi: v3Factory, address: V3_FACTORY } as const
const positionManagerContract = { chainId: 8899, address: POSITION_MANAGER, abi: NonfungiblePositionManager } as const
const qouterV2Contract = { chainId: 8899, abi: qouterV2, address: QOUTER_V2 } as const
const router02Contract = { chainId: 8899, abi: router02, address: ROUTER02 } as const
const erc20ABI = { chainId: 8899, abi: erc20Abi } as const
const v3PoolABI = { chainId: 8899, abi: v3Pool } as const

type MyPosition = {
    Id: number;
    Name: string;
    Image: string;
    FeeTier: number;
    Pair: string;
    Token0Addr: string;
    Token1Addr: string;
    Token0: string;
    Token1: string;
    Amount0: number;
    Amount1: number;
    MinPrice: number;
    MaxPrice: number;
    CurrPrice: number;
    LowerTick: number;
    UpperTick: number;
    Liquidity: string;
    Fee0: number;
    Fee1: number;
}

export default function Swap({ 
    config, setIsLoading, txupdate, setTxupdate, setErrMsg, 
}: {
    config: Config,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
    txupdate: String | null,
    setTxupdate: React.Dispatch<React.SetStateAction<String | null>>,
    setErrMsg: React.Dispatch<React.SetStateAction<String | null>>,
}) {
    const [mode, setMode] = React.useState(0)
    const { address } = useAccount()
    const [exchangeRate, setExchangeRate] = React.useState("")
    const [altRoute, setAltRoute] = React.useState<{a: '0xstring', b: '0xstring', c: '0xstring'}>()
    const [tvl10000, setTvl10000] = React.useState("")
    const [tvl3000, setTvl3000] = React.useState("")
    const [tvl500, setTvl500] = React.useState("")
    const [tvl100, setTvl100] = React.useState("")
    const [newPrice, setNewPrice] = React.useState("")
    const [query, setQuery] = React.useState('')
    const filteredTokens =
        query === ''
            ? tokens
            : tokens.filter((token) => {
                return token.name.toLowerCase().includes(query.toLowerCase())
            })
    const [tokenA, setTokenA] = React.useState<{name: string, value: '0xstring', logo: string}>(tokens[0])
    const [tokenABalance, setTokenABalance] = React.useState("")
    const [amountA, setAmountA] = React.useState("")
    const [tokenB, setTokenB] = React.useState<{name: string, value: '0xstring', logo: string}>({name: 'Choose Token', value: '' as '0xstring', logo: '/../favicon.png'})
    const [tokenBBalance, setTokenBBalance] = React.useState("")
    const [amountB, setAmountB] = React.useState("")
    const [feeSelect, setFeeSelect] = React.useState(10000)
    const [pairDetect, setPairDetect] = React.useState("")
    const [currPrice, setCurrPrice] = React.useState("")
    const [lowerPrice, setLowerPrice] = React.useState("")
    const [upperPrice, setUpperPrice] = React.useState("")
    const [lowerPercentage, setLowerPercentage] = React.useState("0")
    const [upperPercentage, setUpperPercentage] = React.useState("0")
    const [currTickSpacing, setCurrTickSpacing] = React.useState("")
    const [lowerTick, setLowerTick] = React.useState("")
    const [upperTick, setUpperTick] = React.useState("")
    const [rangePercentage, setRangePercentage] = React.useState(0.15)
    const [position, setPosition] = React.useState<MyPosition[]>([])
    const [positionSelected, setPositionSelected] = React.useState<MyPosition>()
    const [isAddPositionModal, setIsAddPositionModal] = React.useState(false)
    const [isRemPositionModal, setIsRemPositionModal] = React.useState(false)
    const [amountRemove, setAmountRemove] = React.useState("")

    function encodePath(tokens: string[], fees: number[]): string {
        let path = "0x"
        for (let i = 0; i < fees.length; i++) {
            path += tokens[i].slice(2)
            path += fees[i].toString(16).padStart(6, "0")
        }
        path += tokens[tokens.length - 1].slice(2)
        return path
    }

    const getQoute = useDebouncedCallback(async (_amount: string) => {
        try {
            if (Number(_amount) !== 0) {
                if (altRoute === undefined) {
                    const qouteOutput = await simulateContract(config, {
                        ...qouterV2Contract,
                        functionName: 'quoteExactInputSingle',
                        args: [{
                            tokenIn: tokenA.value as '0xstring',
                            tokenOut: tokenB.value as '0xstring',
                            amountIn: parseEther(_amount),
                            fee: feeSelect,
                            sqrtPriceLimitX96: BigInt(0),
                        }]
                    })
                    setAmountB(formatEther(qouteOutput.result[0]))
                    let newPrice = 1 / ((Number(qouteOutput.result[1]) / (2 ** 96)) ** 2)
                    setNewPrice(newPrice.toString())
                } else {
                    const route = encodePath([altRoute.a, altRoute.b, altRoute.c], [feeSelect, feeSelect])
                    const qouteOutput = await simulateContract(config, {
                        ...qouterV2Contract,
                        functionName: 'quoteExactInput',
                        args: [route as '0xstring', parseEther(_amount)]
                    })
                    setAmountB(formatEther(qouteOutput.result[0]))
                    let newPrice = 1 / ((Number(qouteOutput.result[1]) / (2 ** 96)) ** 2)
                    setNewPrice(newPrice.toString())
                }
            } else {
                setAmountB("")
            }
        } catch {}
    }, 700)

    const switchToken = () => {
        const _tokenA = tokenB
        const _tokenB = tokenA
        setTokenA(_tokenA)
        setTokenB(_tokenB)
    }

    const swap = async () => {
        setIsLoading(true)
        try {
            const allowanceA = await readContract(config, { ...erc20ABI, address: tokenA.value as '0xstring', functionName: 'allowance', args: [address as '0xstring', ROUTER02] })
            if (allowanceA < parseEther(amountA)) {
                const { request } = await simulateContract(config, { ...erc20ABI, address: tokenA.value as '0xstring', functionName: 'approve', args: [ROUTER02, parseEther(amountA)] })
                const h = await writeContract(config, request)
                await waitForTransactionReceipt(config, { hash: h })
            }
            let h
            if (altRoute === undefined) {
                const { request } = await simulateContract(config, {
                    ...router02Contract,
                    functionName: 'exactInputSingle',
                    args: [{
                        tokenIn: tokenA.value as '0xstring',
                        tokenOut: tokenB.value as '0xstring',
                        fee: feeSelect,
                        recipient: address as '0xstring',
                        amountIn: parseEther(amountA),
                        amountOutMinimum: parseEther(String(Number(amountB) * 0.95)),
                        sqrtPriceLimitX96: BigInt(0)
                    }]
                })
                h = await writeContract(config, request)
            } else {
                const route = encodePath([altRoute.a, altRoute.b, altRoute.c], [feeSelect, feeSelect])
                const { request } = await simulateContract(config, {
                    ...router02Contract,
                    functionName: 'exactInput',
                    args: [{
                        path: route as '0xstring',
                        recipient: address as '0xstring',
                        amountIn: parseEther(amountA),
                        amountOutMinimum: parseEther(String(Number(amountB) * 0.95))
                    }]
                })
                h = await writeContract(config, request)
            }
            await waitForTransactionReceipt(config, { hash: h })
            setTxupdate(h)
        } catch (e) {
            setErrMsg(String(e))
        }
        setIsLoading(false)
    }

    const calcAmount0 = (
        liquidity: number,
        currentPrice: number,
        priceLower: number,
        priceUpper: number,
        token0Decimals: number,
        token1Decimals: number
    ) => {
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals)
        const mathCurrentPrice = Math.sqrt(currentPrice / decimalAdjustment)
        const mathPriceUpper = Math.sqrt(priceUpper / decimalAdjustment)
        const mathPriceLower = Math.sqrt(priceLower / decimalAdjustment)
        
        let math
        if (mathCurrentPrice <= mathPriceLower) {
            math = liquidity * ((mathPriceUpper - mathPriceLower) / (mathPriceLower * mathPriceUpper))
        } else {
            math = liquidity * ((mathPriceUpper - mathCurrentPrice) / (mathCurrentPrice * mathPriceUpper))
        }
        const adjustedMath = math > 0 ? math : 0
        return adjustedMath
    }
      
    const calcAmount1 = (
        liquidity: number,
        currentPrice: number,
        priceLower: number,
        priceUpper: number,
        token0Decimals: number,
        token1Decimals: number
    ) => {
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals)
        const mathCurrentPrice = Math.sqrt(currentPrice / decimalAdjustment)
        const mathPriceUpper = Math.sqrt(priceUpper / decimalAdjustment)
        const mathPriceLower = Math.sqrt(priceLower / decimalAdjustment)
        
        let math
        if (mathCurrentPrice >= mathPriceUpper) {
            math = liquidity * (mathPriceUpper - mathPriceLower)
        } else {
            math = liquidity * (mathCurrentPrice - mathPriceLower)
        }
        const adjustedMath = math > 0 ? math : 0
        return adjustedMath
    }

    const setAlignedLowerTick = useDebouncedCallback((_lowerPrice: string) => {
        setAmountA("")
        setAmountB("")
        const _lowerTick = Math.floor(Math.log(Number(_lowerPrice)) / Math.log(1.0001))
        let alignedLowerTick
        if (Number(_lowerPrice) === 0) {
            alignedLowerTick = Math.ceil(TickMath.MIN_TICK / Number(currTickSpacing)) * Number(currTickSpacing)
        } else {
            alignedLowerTick = Math.floor(_lowerTick / Number(currTickSpacing)) * Number(currTickSpacing)
            setLowerPrice(Math.pow(1.0001, alignedLowerTick).toString())
        }
        setLowerPercentage((((Math.pow(1.0001, alignedLowerTick) / Number(currPrice)) - 1) * 100).toString())
        setLowerTick(alignedLowerTick.toString())
    }, 700)

    const setAlignedUpperTick = useDebouncedCallback((_upperPrice: string) => {
        setAmountA("")
        setAmountB("")
        if (Number(_upperPrice) < Number(lowerPrice)) {
            setUpperPrice("")
            setUpperPercentage("")
        } else {
            const _upperTick = Math.ceil(Math.log(Number(_upperPrice)) / Math.log(1.0001))
            let alignedUpperTick
            if (Number(_upperPrice) === Infinity) {
                alignedUpperTick = Math.floor(TickMath.MAX_TICK / Number(currTickSpacing)) * Number(currTickSpacing)
                setUpperPercentage('+♾️')
            } else {
                alignedUpperTick = Math.ceil(_upperTick / Number(currTickSpacing)) * Number(currTickSpacing)
                setUpperPercentage((((Math.pow(1.0001, alignedUpperTick) / Number(currPrice)) - 1) * 100).toString())
                setUpperPrice(Math.pow(1.0001, alignedUpperTick).toString())
            }
            setUpperTick(alignedUpperTick.toString())
        }
    }, 700)

    const setAlignedAmountA = useDebouncedCallback(async (_amountB: string) => {
        const poolState = await readContracts(config, {
            contracts: [
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'token0' },
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'slot0' },
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'liquidity' }
            ]
        })
        const token0 = poolState[0].result !== undefined ? poolState[0].result : "" as '0xstring'
        const sqrtPriceX96 = poolState[1].result !== undefined ? poolState[1].result[0] : BigInt(0)
        const tick = poolState[1].result !== undefined ? poolState[1].result[1] : 0
        const liquidity = poolState[2].result !== undefined ? poolState[2].result : BigInt(0)
        const Token0 = new Token(8899, token0, 18)
        const Token1 = String(token0).toUpperCase() === tokenA.value.toUpperCase() ? new Token(8899, tokenB.value, 18) : new Token(8899, tokenA.value, 18)
        const pool = new Pool(
            Token0,
            Token1,
            Number(feeSelect),
            sqrtPriceX96.toString(),
            liquidity.toString(),
            tick
        )
        if (String(token0).toUpperCase() === tokenA.value.toUpperCase()) {
            const singleSidePositionToken1 = Position.fromAmount1({
                pool, 
                tickLower: Number(lowerTick), 
                tickUpper: Number(upperTick), 
                amount1: String(parseEther(_amountB)) as BigintIsh,
            })
            setAmountA(formatEther(singleSidePositionToken1.mintAmounts.amount0 as unknown as bigint))
        } else {
            const singleSidePositionToken0 = Position.fromAmount0({
                pool, 
                tickLower: Number(lowerTick), 
                tickUpper: Number(upperTick), 
                amount0: String(parseEther(_amountB)) as BigintIsh,
                useFullPrecision: true
            })
            setAmountA(formatEther(singleSidePositionToken0.mintAmounts.amount1 as unknown as bigint))
        }
    }, 700)

    const setAlignedAmountB = useDebouncedCallback(async (_amountA: string) => {
        const poolState = await readContracts(config, {
            contracts: [
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'token0' },
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'slot0' },
                { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'liquidity' },
            ]
        })
        const token0 = poolState[0].result !== undefined ? poolState[0].result : "" as '0xstring'
        const sqrtPriceX96 = poolState[1].result !== undefined ? poolState[1].result[0] : BigInt(0)
        const tick = poolState[1].result !== undefined ? poolState[1].result[1] : 0
        const liquidity = poolState[2].result !== undefined ? poolState[2].result : BigInt(0)
        const Token0 = new Token(8899, token0, 18)
        const Token1 = String(token0).toUpperCase() === tokenA.value.toUpperCase() ? new Token(8899, tokenB.value, 18) : new Token(8899, tokenA.value, 18)
        const pool = new Pool(
            Token0,
            Token1,
            Number(feeSelect),
            sqrtPriceX96.toString(),
            liquidity.toString(),
            tick
        )
        if (String(token0).toUpperCase() === tokenA.value.toUpperCase()) {
            const singleSidePositionToken0 = Position.fromAmount0({
                pool, 
                tickLower: Number(lowerTick), 
                tickUpper: Number(upperTick), 
                amount0: String(parseEther(_amountA)) as BigintIsh,
                useFullPrecision: true
            })
            setAmountB(formatEther(singleSidePositionToken0.mintAmounts.amount1 as unknown as bigint))
        } else {
            const singleSidePositionToken1 = Position.fromAmount1({
                pool, 
                tickLower: Number(lowerTick), 
                tickUpper: Number(upperTick), 
                amount1: String(parseEther(_amountA)) as BigintIsh,
            })
            setAmountB(formatEther(singleSidePositionToken1.mintAmounts.amount0 as unknown as bigint))
        }
    }, 700)

    const getBalanceOfAB = async (_tokenAvalue: '0xstring', _tokenBvalue: '0xstring') => {
        const bal = await readContracts(config, {
            contracts: [
                { ...erc20ABI, address: _tokenAvalue, functionName: 'balanceOf', args: [address as '0xstring'] },
                { ...erc20ABI, address: _tokenBvalue, functionName: 'balanceOf', args: [address as '0xstring'] },
            ]
        })
        bal[0].result !== undefined && setTokenABalance(formatEther(bal[0].result as bigint))
        bal[1].result !== undefined && setTokenBBalance(formatEther(bal[1].result as bigint))
    }

    const increaseLiquidity = async (_tokenId: bigint) => {
        setIsLoading(true)
        try {
            const allowanceA = await readContract(config, { ...erc20ABI, address: tokenA.value, functionName: 'allowance', args: [address as '0xstring', POSITION_MANAGER] })
            if (allowanceA < parseEther(amountA)) {
                const { request } = await simulateContract(config, { ...erc20ABI, address: tokenA.value, functionName: 'approve', args: [POSITION_MANAGER, parseEther(amountA)] })
                const h = await writeContract(config, request)
                await waitForTransactionReceipt(config, { hash: h })
            }
            const allowanceB = await readContract(config, { ...erc20ABI, address: tokenB.value, functionName: 'allowance', args: [address as '0xstring', POSITION_MANAGER] })
            if (allowanceB < parseEther(amountB)) {
                const { request } = await simulateContract(config, { ...erc20ABI, address: tokenB.value, functionName: 'approve', args: [POSITION_MANAGER, parseEther(amountB)] })
                const h = await writeContract(config, request)
                await waitForTransactionReceipt(config, { hash: h })
            }
            const { request } = await simulateContract(config, {
                ...positionManagerContract,
                functionName: 'increaseLiquidity',
                args: [{
                    tokenId: _tokenId, 
                    amount0Desired: parseEther(amountA),
                    amount1Desired: parseEther(amountB),
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
                }]
            })
            const h = await writeContract(config, request)
            await waitForTransactionReceipt(config, { hash: h })
            setTxupdate(h)
        } catch (e) {
            setErrMsg(String(e))
        }
        clearState()
        setIsAddPositionModal(false)
        setIsLoading(false)
    }

    const decreaseLiquidity = async (_tokenId: bigint, _liquidity: bigint) => {
        setIsLoading(true)
        try {
            const { request: request1 } = await simulateContract(config, {
                ...positionManagerContract,
                functionName: 'decreaseLiquidity',
                args: [{
                    tokenId: _tokenId, 
                    liquidity: _liquidity,
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
                }]
            })
            let h = await writeContract(config, request1)
            await waitForTransactionReceipt(config, { hash: h })
            const { request: request2 } = await simulateContract(config, {
                ...positionManagerContract,
                functionName: 'collect',
                args: [{
                    tokenId: _tokenId, 
                    recipient: address as '0xstring',
                    amount0Max: BigInt("340282366920938463463374607431768211455"),
                    amount1Max: BigInt("340282366920938463463374607431768211455"),
                }]
            })
            h = await writeContract(config, request2)
            await waitForTransactionReceipt(config, { hash: h })
            setTxupdate(h)
        } catch (e) {
            setErrMsg(String(e))
        }
        setAmountRemove('')
        setIsRemPositionModal(false)
        setIsLoading(false)
    }

    const collectFee = async (_tokenId: bigint) => {
        setIsLoading(true)
        try {
            const { request } = await simulateContract(config, {
                ...positionManagerContract,
                functionName: 'collect',
                args: [{
                    tokenId: _tokenId, 
                    recipient: address as '0xstring',
                    amount0Max: BigInt("340282366920938463463374607431768211455"),
                    amount1Max: BigInt("340282366920938463463374607431768211455"),
                }]
            })
            let h = await writeContract(config, request)
            await waitForTransactionReceipt(config, { hash: h })
            setTxupdate(h)
        } catch (e) {
            setErrMsg(String(e))
        }
        setAmountRemove('')
        setIsRemPositionModal(false)
        setIsLoading(false)
    }

    const placeLiquidity = async () => {
        setIsLoading(true)
        try {
            let getToken0 = pairDetect !== '0x0000000000000000000000000000000000000000' ? 
                await readContract(config, { ...v3PoolABI, address: pairDetect as '0xstring', functionName: 'token0' }) :
                ''
            if (pairDetect === '0x0000000000000000000000000000000000000000') {
                const { request: request0 } = await simulateContract(config, {
                    ...v3FactoryContract,
                    functionName: 'createPool',
                    args: [tokenA.value, tokenB.value, feeSelect]
                })
                let h = await writeContract(config, request0)
                await waitForTransactionReceipt(config, { hash: h })

                const newPair = await readContract(config, {...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, feeSelect] })
                getToken0 = await readContract(config, { ...v3PoolABI, address: newPair as '0xstring', functionName: 'token0'})
                const amount0 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? amountA : amountB
                const amount1 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? amountB : amountA
                const { request: request1 } = await simulateContract(config, {
                    ...v3PoolABI,
                    address: newPair as '0xstring',
                    functionName: 'initialize',
                    args: [BigInt(encodeSqrtRatioX96(parseEther(amount1).toString(), parseEther(amount0).toString()).toString())]
                })
                h = await writeContract(config, request1)
                await waitForTransactionReceipt(config, { hash: h })
                setTxupdate(h)
            }
            
            const allowanceA = await readContract(config, { ...erc20ABI, address: tokenA.value, functionName: 'allowance', args: [address as '0xstring', POSITION_MANAGER] })
            if (allowanceA < parseEther(amountA)) {
                const { request } = await simulateContract(config, { ...erc20ABI, address: tokenA.value, functionName: 'approve', args: [POSITION_MANAGER, parseEther(amountA)] })
                const h = await writeContract(config, request)
                await waitForTransactionReceipt(config, { hash: h })
            }
            const allowanceB = await readContract(config, { ...erc20ABI, address: tokenB.value, functionName: 'allowance', args: [address as '0xstring', POSITION_MANAGER] })
            if (allowanceB < parseEther(amountB)) {
                const { request } = await simulateContract(config, { ...erc20ABI, address: tokenB.value, functionName: 'approve', args: [POSITION_MANAGER, parseEther(amountB)] })
                const h = await writeContract(config, request)
                await waitForTransactionReceipt(config, { hash: h })
            }
            
            const token0 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? tokenA : tokenB
            const token1 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? tokenB : tokenA
            const amount0 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? amountA : amountB
            const amount1 = getToken0.toUpperCase() === tokenA.value.toUpperCase() ? amountB : amountA
            const { request } = await simulateContract(config, {
                ...positionManagerContract,
                functionName: 'mint',
                args: [{
                    token0: token0.value as '0xstring',
                    token1: token1.value as '0xstring',
                    fee: feeSelect,
                    tickLower: Number(lowerTick),
                    tickUpper: Number(upperTick),
                    amount0Desired: parseEther(amount0),
                    amount1Desired: parseEther(amount1),
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    recipient: address as '0xstring',
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
                }]
            })
            const h = await writeContract(config, request)
            await waitForTransactionReceipt(config, { hash: h })
            setTxupdate(h)
        } catch (e) {
            setErrMsg(String(e))
        }
        setIsLoading(false)
    }

    React.useEffect(() => {
        const fetchStateMode0 = async () => {
            tokenA.value.toUpperCase() === tokenB.value.toUpperCase() && setTokenB({name: 'Choose Token', value: '' as '0xstring', logo: '/../favicon.png'})

            const stateA = await readContracts(config, {
                contracts: [
                    { ...erc20ABI, address: tokenA.value, functionName: 'symbol' },
                    { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [address as '0xstring'] }
                ]
            })
            const stateB = await readContracts(config, {
                contracts: [
                    { ...erc20ABI, address: tokenB.value, functionName: 'symbol' },
                    { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [address as '0xstring'] },
                    { ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, 10000] },
                    { ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, 3000] },
                    { ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, 500] },
                    { ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, 100] },
                ]
            })
            stateA[0].result !== undefined && tokenA.name === "Choose Token" && setTokenA({
                name: stateA[0].result,
                value: tokenA.value,
                logo: tokens.map(obj => obj.value).indexOf(tokenA.value) !== -1 ? 
                    tokens[tokens.map(obj => obj.value).indexOf(tokenA.value)].logo : 
                    "/../favicon.png"
            })
            stateB[0].result !== undefined && tokenB.name === "Choose Token" && setTokenB({
                name: stateB[0].result, 
                value: tokenB.value, 
                logo: tokens.map(obj => obj.value).indexOf(tokenB.value) !== -1 ? 
                    tokens[tokens.map(obj => obj.value).indexOf(tokenB.value)].logo : 
                    "/../favicon.png"
            })
            stateA[1].result !== undefined && setTokenABalance(formatEther(stateA[1].result))
            stateB[1].result !== undefined && setTokenBBalance(formatEther(stateB[1].result))
            const pair10000 = stateB[2].result !== undefined ? stateB[2].result  as '0xstring' : '' as '0xstring'
            const pair3000 = stateB[3].result !== undefined ? stateB[3].result  as '0xstring' : '' as '0xstring'
            const pair500 = stateB[4].result !== undefined ? stateB[4].result  as '0xstring' : '' as '0xstring'
            const pair100 = stateB[5].result !== undefined ? stateB[5].result  as '0xstring' : '' as '0xstring'

            if (tokenA.name !== 'Choose Token' && tokenB.name !== 'Choose Token') {
                try {
                    setAltRoute(undefined)
                    const poolState = await readContracts(config, {
                        contracts: [
                            { ...v3PoolABI, address: pair10000, functionName: 'token0' },
                            { ...v3PoolABI, address: pair10000, functionName: 'slot0' },
                            { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [pair10000] },
                            { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [pair10000] },
                            { ...v3PoolABI, address: pair3000, functionName: 'token0' },
                            { ...v3PoolABI, address: pair3000, functionName: 'slot0' },
                            { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [pair3000] },
                            { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [pair3000] },
                            { ...v3PoolABI, address: pair500, functionName: 'token0' },
                            { ...v3PoolABI, address: pair500, functionName: 'slot0' },
                            { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [pair500] },
                            { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [pair500] },
                            { ...v3PoolABI, address: pair100, functionName: 'token0' },
                            { ...v3PoolABI, address: pair100, functionName: 'slot0' },
                            { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [pair100] },
                            { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [pair100] },
                        ]
                    })
                    const token0_10000 = poolState[0].result !== undefined ? poolState[0].result : "" as '0xstring'
                    const sqrtPriceX96_10000 = poolState[1].result !== undefined ? poolState[1].result[0] : BigInt(0)
                    const tokenAamount_10000 = poolState[2].result !== undefined ? poolState[2].result : BigInt(0)
                    const tokenBamount_10000 = poolState[3].result !== undefined ? poolState[3].result : BigInt(0)
                    const currPrice_10000 = token0_10000.toUpperCase() === tokenB.value.toUpperCase() ? (Number(sqrtPriceX96_10000) / (2 ** 96)) ** 2 : (1 / ((Number(sqrtPriceX96_10000) / (2 ** 96)) ** 2))
                    const tvl_10000 = currPrice_10000 !== 0 ?  (Number(formatEther(tokenAamount_10000)) * (1 / currPrice_10000)) + Number(formatEther(tokenBamount_10000)) : 0
                    feeSelect === 10000 && currPrice_10000 !== Infinity && setExchangeRate(currPrice_10000.toString())
                    feeSelect === 10000 && tvl_10000 < 1e-9 && setExchangeRate('0')
                    tvl_10000 >= 1e-9 ? setTvl10000(tvl_10000.toString()) : setTvl10000('0')
                    if (feeSelect === 10000 && tvl_10000 < 1e-9) {
                        const init: any = {contracts: []}
                        for (let i = 0; i <= tokens.length - 1; i++) {
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokens[i].value, 10000] })
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokens[i].value, tokenB.value, 10000] })
                        }
                        const findAltRoute = await readContracts(config, init)
                        let altIntermediate
                        let altPair0
                        let altPair1
                        for (let i = 0; i <= findAltRoute.length - 1; i+=2) {
                            if (findAltRoute[i].result !== '0x0000000000000000000000000000000000000000' && findAltRoute[i+1].result !== '0x0000000000000000000000000000000000000000') {
                                altIntermediate = tokens[i / 2]
                                altPair0 = findAltRoute[i].result 
                                altPair1 = findAltRoute[i+1].result
                                break
                            }
                        }
                        console.log({altIntermediate, altPair0, altPair1}) // for quick debugging
                        if (altIntermediate !== undefined) {
                            setAltRoute({a: tokenA.value, b: altIntermediate.value, c: tokenB.value})
                            const altPoolState = await readContracts(config, {
                                contracts: [
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'slot0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'slot0' },
                                ]
                            })
                            const altToken0 = altPoolState[0].result !== undefined ? altPoolState[0].result : "" as '0xstring'
                            const alt0sqrtPriceX96 = altPoolState[1].result !== undefined ? altPoolState[1].result[0] : BigInt(0)
                            const altPrice0 = altToken0.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2))
                            const altToken1 = altPoolState[2].result !== undefined ? altPoolState[2].result : "" as '0xstring'
                            const alt1sqrtPriceX96 = altPoolState[3].result !== undefined ? altPoolState[3].result[0] : BigInt(0)
                            const altPrice1 = altToken1.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2))
                            setExchangeRate((altPrice1 / altPrice0).toString())
                        }
                    }

                    const token0_3000 = poolState[4].result !== undefined ? poolState[4].result : "" as '0xstring'
                    const sqrtPriceX96_3000 = poolState[5].result !== undefined ? poolState[5].result[0] : BigInt(0)
                    const tokenAamount_3000 = poolState[6].result !== undefined ? poolState[6].result : BigInt(0)
                    const tokenBamount_3000 = poolState[7].result !== undefined ? poolState[7].result : BigInt(0)
                    const currPrice_3000 = token0_3000.toUpperCase() === tokenB.value.toUpperCase() ? (Number(sqrtPriceX96_3000) / (2 ** 96)) ** 2 : (1 / ((Number(sqrtPriceX96_3000) / (2 ** 96)) ** 2))
                    const tvl_3000 = (Number(formatEther(tokenAamount_3000)) * (1 / currPrice_3000)) + Number(formatEther(tokenBamount_3000));
                    feeSelect === 3000 && setExchangeRate(currPrice_3000.toString())
                    feeSelect === 3000 && tvl_3000 < 1e-9 && setExchangeRate('0')
                    tvl_3000 >= 1e-9 ? setTvl3000(tvl_3000.toString()) : setTvl3000('0')
                    if (feeSelect === 3000 && tvl_3000 < 1e-9) {
                        const init: any = {contracts: []}
                        for (let i = 0; i <= tokens.length - 1; i++) {
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokens[i].value, 3000] })
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokens[i].value, tokenB.value, 3000] })
                        }
                        const findAltRoute = await readContracts(config, init)
                        let altIntermediate
                        let altPair0
                        let altPair1
                        for (let i = 0; i <= findAltRoute.length - 1; i+=2) {
                            if (findAltRoute[i].result !== '0x0000000000000000000000000000000000000000' && findAltRoute[i+1].result !== '0x0000000000000000000000000000000000000000') {
                                altIntermediate = tokens[0]
                                altPair0 = findAltRoute[i].result 
                                altPair1 = findAltRoute[i+1].result
                                break
                            }
                        }
                        if (altIntermediate !== undefined) {
                            setAltRoute({a: tokenA.value, b: altIntermediate.value, c: tokenB.value})
                            const altPoolState = await readContracts(config, {
                                contracts: [
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'slot0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'slot0' },
                                ]
                            })
                            const altToken0 = altPoolState[0].result !== undefined ? altPoolState[0].result : "" as '0xstring'
                            const alt0sqrtPriceX96 = altPoolState[1].result !== undefined ? altPoolState[1].result[0] : BigInt(0)
                            const altPrice0 = altToken0.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2))
                            const altToken1 = altPoolState[2].result !== undefined ? altPoolState[2].result : "" as '0xstring'
                            const alt1sqrtPriceX96 = altPoolState[3].result !== undefined ? altPoolState[3].result[0] : BigInt(0)
                            const altPrice1 = altToken1.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2))
                            feeSelect === 3000 && setExchangeRate((altPrice1 / altPrice0).toString())
                        }
                    }
                    
                    const token0_500 = poolState[8].result !== undefined ? poolState[8].result : "" as '0xstring'
                    const sqrtPriceX96_500 = poolState[9].result !== undefined ? poolState[9].result[0] : BigInt(0)
                    const tokenAamount_500 = poolState[10].result !== undefined ? poolState[10].result : BigInt(0)
                    const tokenBamount_500 = poolState[11].result !== undefined ? poolState[11].result : BigInt(0)
                    const currPrice_500 = token0_500.toUpperCase() === tokenB.value.toUpperCase() ? (Number(sqrtPriceX96_500) / (2 ** 96)) ** 2 : (1 / ((Number(sqrtPriceX96_500) / (2 ** 96)) ** 2))
                    const tvl_500 = (Number(formatEther(tokenAamount_500)) * (1 / currPrice_500)) + Number(formatEther(tokenBamount_500));
                    feeSelect === 500 && setExchangeRate(currPrice_500.toString())
                    feeSelect === 500 && tvl_500 < 1e-9 && setExchangeRate('0')
                    tvl_500 >= 1e-9 ? setTvl500(tvl_500.toString()) : setTvl500('0')
                    if (feeSelect === 500 && tvl_500 < 1e-9) {
                        const init: any = {contracts: []}
                        for (let i = 0; i <= tokens.length - 1; i++) {
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokens[i].value, 500] })
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokens[i].value, tokenB.value, 500] })
                        }
                        const findAltRoute = await readContracts(config, init)
                        let altIntermediate
                        let altPair0
                        let altPair1
                        for (let i = 0; i <= findAltRoute.length - 1; i+=2) {
                            if (findAltRoute[i].result !== '0x0000000000000000000000000000000000000000' && findAltRoute[i+1].result !== '0x0000000000000000000000000000000000000000') {
                                altIntermediate = tokens[0]
                                altPair0 = findAltRoute[i].result 
                                altPair1 = findAltRoute[i+1].result
                                break
                            }
                        }
                        if (altIntermediate !== undefined) {
                            setAltRoute({a: tokenA.value, b: altIntermediate.value, c: tokenB.value})
                            const altPoolState = await readContracts(config, {
                                contracts: [
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'slot0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'slot0' },
                                ]
                            })
                            const altToken0 = altPoolState[0].result !== undefined ? altPoolState[0].result : "" as '0xstring'
                            const alt0sqrtPriceX96 = altPoolState[1].result !== undefined ? altPoolState[1].result[0] : BigInt(0)
                            const altPrice0 = altToken0.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2))
                            const altToken1 = altPoolState[2].result !== undefined ? altPoolState[2].result : "" as '0xstring'
                            const alt1sqrtPriceX96 = altPoolState[3].result !== undefined ? altPoolState[3].result[0] : BigInt(0)
                            const altPrice1 = altToken1.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2))
                            feeSelect === 500 && setExchangeRate((altPrice1 / altPrice0).toString())
                        }
                    }

                    const token0_100 = poolState[12].result !== undefined ? poolState[12].result : "" as '0xstring'
                    const sqrtPriceX96_100 = poolState[13].result !== undefined ? poolState[13].result[0] : BigInt(0)
                    const tokenAamount_100 = poolState[14].result !== undefined ? poolState[14].result : BigInt(0)
                    const tokenBamount_100 = poolState[15].result !== undefined ? poolState[15].result : BigInt(0)
                    const currPrice_100 = token0_100.toUpperCase() === tokenB.value.toUpperCase() ? (Number(sqrtPriceX96_100) / (2 ** 96)) ** 2 : (1 / ((Number(sqrtPriceX96_100) / (2 ** 96)) ** 2))
                    const tvl_100 = (Number(formatEther(tokenAamount_100)) * (1 / currPrice_100)) + Number(formatEther(tokenBamount_100));
                    feeSelect === 100 && setExchangeRate(currPrice_100.toString())
                    feeSelect === 100 && tvl_100 < 1e-9 && setExchangeRate('0')
                    tvl_100 >= 1e-9 ? setTvl100(tvl_100.toString()) : setTvl100('0')
                    if (feeSelect === 100 && tvl_100 < 1e-9) {
                        const init: any = {contracts: []}
                        for (let i = 0; i <= tokens.length - 1; i++) {
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokens[i].value, 100] })
                            init.contracts.push({ ...v3FactoryContract, functionName: 'getPool', args: [tokens[i].value, tokenB.value, 100] })
                        }
                        const findAltRoute = await readContracts(config, init)
                        let altIntermediate
                        let altPair0
                        let altPair1
                        for (let i = 0; i <= findAltRoute.length - 1; i+=2) {
                            if (findAltRoute[i].result !== '0x0000000000000000000000000000000000000000' && findAltRoute[i+1].result !== '0x0000000000000000000000000000000000000000') {
                                altIntermediate = tokens[0]
                                altPair0 = findAltRoute[i].result 
                                altPair1 = findAltRoute[i+1].result
                                break
                            }
                        }
                        if (altIntermediate !== undefined) {
                            setAltRoute({a: tokenA.value, b: altIntermediate.value, c: tokenB.value})
                            const altPoolState = await readContracts(config, {
                                contracts: [
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair0 as '0xstring', functionName: 'slot0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'token0' },
                                    { ...v3PoolABI, address: altPair1 as '0xstring', functionName: 'slot0' },
                                ]
                            })
                            const altToken0 = altPoolState[0].result !== undefined ? altPoolState[0].result : "" as '0xstring'
                            const alt0sqrtPriceX96 = altPoolState[1].result !== undefined ? altPoolState[1].result[0] : BigInt(0)
                            const altPrice0 = altToken0.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt0sqrtPriceX96) / (2 ** 96)) ** 2))
                            const altToken1 = altPoolState[2].result !== undefined ? altPoolState[2].result : "" as '0xstring'
                            const alt1sqrtPriceX96 = altPoolState[3].result !== undefined ? altPoolState[3].result[0] : BigInt(0)
                            const altPrice1 = altToken1.toUpperCase() === tokenA.value.toUpperCase() ? (Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2 : (1 / ((Number(alt1sqrtPriceX96) / (2 ** 96)) ** 2))
                            feeSelect === 100 && setExchangeRate((altPrice1 / altPrice0).toString())
                        }
                    }
                } catch {
                    setExchangeRate("0")
                }
            }
        }

        const fetchStateMode1 = async () => {
            tokenA.value.toUpperCase() === tokenB.value.toUpperCase() && setTokenB({name: 'Choose Token', value: '' as '0xstring', logo: '/../favicon.png'})

            const stateA = await readContracts(config, {
                contracts: [
                    { ...erc20ABI, address: tokenA.value, functionName: 'symbol' },
                    { ...erc20ABI, address: tokenA.value, functionName: 'balanceOf', args: [address as '0xstring'] }
                ]
            })
            const stateB = await readContracts(config, {
                contracts: [
                    { ...erc20ABI, address: tokenB.value, functionName: 'symbol' },
                    { ...erc20ABI, address: tokenB.value, functionName: 'balanceOf', args: [address as '0xstring'] },
                    { ...v3FactoryContract, functionName: 'getPool', args: [tokenA.value, tokenB.value, feeSelect] }
                ]
            })
            stateA[0].result !== undefined && tokenA.name === "Choose Token" && setTokenA({
                name: stateA[0].result,
                value: tokenA.value, 
                logo: tokens.map(obj => obj.value).indexOf(tokenA.value) !== -1 ? 
                    tokens[tokens.map(obj => obj.value).indexOf(tokenA.value)].logo : 
                    "/../favicon.png"
            })
            stateB[0].result !== undefined && tokenB.name === "Choose Token" && setTokenB({
                name: stateB[0].result, 
                value: tokenB.value, 
                logo: tokens.map(obj => obj.value).indexOf(tokenB.value) !== -1 ? 
                    tokens[tokens.map(obj => obj.value).indexOf(tokenB.value)].logo : 
                    "/../favicon.png"
            })
            stateA[1].result !== undefined && setTokenABalance(formatEther(stateA[1].result))
            stateB[1].result !== undefined && setTokenBBalance(formatEther(stateB[1].result))
            stateB[2].result !== undefined && setPairDetect(stateB[2].result)
            
            if (stateB[2].result !== undefined && stateB[2].result !== '0x0000000000000000000000000000000000000000') {
                const poolState = await readContracts(config, {
                    contracts: [
                        { ...v3PoolABI, address: stateB[2].result as '0xstring', functionName: 'token0' },
                        { ...v3PoolABI, address: stateB[2].result as '0xstring', functionName: 'slot0' },
                        { ...v3PoolABI, address: stateB[2].result as '0xstring', functionName: 'tickSpacing' }
                    ]
                })
                const token0 = poolState[0].result !== undefined ? poolState[0].result : "" as '0xstring'
                const sqrtPriceX96 = poolState[1].result !== undefined ? poolState[1].result[0] : BigInt(0)
                const _currPrice = token0.toUpperCase() === tokenB.value.toUpperCase() ? 
                    (Number(sqrtPriceX96) / (2 ** 96)) ** 2 : 
                    (1 / ((Number(sqrtPriceX96) / (2 ** 96)) ** 2));
                poolState[1].result !== undefined && setCurrPrice(_currPrice.toString())
                poolState[2].result !== undefined && setCurrTickSpacing(poolState[2].result.toString())
                
                let _lowerPrice = 0
                let _upperPrice = Infinity
                let alignedLowerTick = 0
                let alignedUpperTick = 0
                if (rangePercentage !== 1) {
                    _lowerPrice = ((Number(sqrtPriceX96) / (2 ** 96)) ** 2) * (1 - rangePercentage)
                    _upperPrice = ((Number(sqrtPriceX96) / (2 ** 96)) ** 2) * (1 + rangePercentage)
                    const _lowerTick = Math.floor(Math.log(_lowerPrice) / Math.log(1.0001))
                    const _upperTick = Math.ceil(Math.log(_upperPrice) / Math.log(1.0001))
                    alignedLowerTick = poolState[2].result !== undefined ? Math.floor(_lowerTick / poolState[2].result) * poolState[2].result : 0
                    alignedUpperTick = poolState[2].result !== undefined ? Math.ceil(_upperTick / poolState[2].result) * poolState[2].result : 0
                } else {
                    alignedLowerTick = poolState[2].result !== undefined ? Math.ceil(TickMath.MIN_TICK / poolState[2].result) * poolState[2].result : 0
                    alignedUpperTick = poolState[2].result !== undefined ? Math.floor(TickMath.MAX_TICK / poolState[2].result) * poolState[2].result : 0
                }
                const _lowerPriceShow = token0.toUpperCase() === tokenB.value.toUpperCase() ? 
                    Math.pow(1.0001, alignedLowerTick) : 
                    1 / Math.pow(1.0001, alignedUpperTick);
                const _upperPriceShow = token0.toUpperCase() === tokenB.value.toUpperCase() ? 
                    Math.pow(1.0001, alignedUpperTick) : 
                    1 / Math.pow(1.0001, alignedLowerTick);
                setLowerTick(alignedLowerTick.toString())
                setUpperTick(alignedUpperTick.toString())
                rangePercentage !== 1 ? setLowerPrice(_lowerPriceShow.toString()) : setLowerPrice(_lowerPrice.toString())
                rangePercentage !== 1 ? setUpperPrice(_upperPriceShow.toString()) : setUpperPrice(_upperPrice.toString())
                rangePercentage !== 1 ? setLowerPercentage((((_lowerPriceShow / _currPrice) - 1) * 100).toString()) : setLowerPercentage('-100')
                rangePercentage !== 1 ? setUpperPercentage((((_upperPriceShow / _currPrice) - 1) * 100).toString()) : setUpperPercentage('+♾️')
            } else {
                setCurrPrice("")
                const getTickSpacing = await readContracts(config, {
                    contracts: [
                        { ...v3FactoryContract, functionName: 'feeAmountTickSpacing', args: [10000] },
                        { ...v3FactoryContract, functionName: 'feeAmountTickSpacing', args: [3000] },
                        { ...v3FactoryContract, functionName: 'feeAmountTickSpacing', args: [500] },
                        { ...v3FactoryContract, functionName: 'feeAmountTickSpacing', args: [100] },
                    ]
                })
                getTickSpacing[0].status === 'success' && feeSelect === 10000 && setCurrTickSpacing(getTickSpacing[0].result.toString())
                getTickSpacing[1].status === 'success' && feeSelect === 3000 && setCurrTickSpacing(getTickSpacing[1].result.toString())
                getTickSpacing[2].status === 'success' && feeSelect === 500 && setCurrTickSpacing(getTickSpacing[2].result.toString())
                getTickSpacing[3].status === 'success' && feeSelect === 100 && setCurrTickSpacing(getTickSpacing[3].result.toString())
            }
        }

        const fetchStateMode2 = async () => {
            const balanceOfMyPosition = await readContract(config, { ...positionManagerContract, functionName: 'balanceOf', args: [address as '0xstring'] })
            const init: any = {contracts: []}
            for (let i = 0; i <= Number(balanceOfMyPosition) - 1; i++) {
                init.contracts.push(
                    { ...positionManagerContract, functionName: 'tokenOfOwnerByIndex', args: [address as '0xstring', i] }
                )
            }
            const tokenIdMyPosition = await readContracts(config, init)
            const tokenUriMyPosition = await readContracts(config, {
                contracts: tokenIdMyPosition.map((obj) => (
                    { ...positionManagerContract, functionName: 'tokenURI', args: [obj.result] }
                ))
            })
            const posMyPosition = await readContracts(config, {
                contracts: tokenIdMyPosition.map((obj) => (
                    { ...positionManagerContract, functionName: 'positions', args: [obj.result] }
                ))
            })

            const myPosition : MyPosition[] = (await Promise.all(tokenIdMyPosition.map(async (obj, index) => {
                const metadataFetch = await fetch(tokenUriMyPosition[index].result as string)
                const metadata = await metadataFetch.json()
                const pos = posMyPosition[index].result !== undefined ? posMyPosition[index].result as unknown as (bigint | string)[] : []

                const pairAddr = await readContract(config, { ...v3FactoryContract, functionName: 'getPool', args: [pos[2] as '0xstring', pos[3] as '0xstring', Number(pos[4])] })
                const slot0 = await readContract(config, { ...v3PoolABI, address: pairAddr, functionName: 'slot0' })
                const tokenName = await readContracts(config, {
                    contracts: [
                        { ...erc20ABI, address: pos[2] as '0xstring', functionName: 'symbol' },
                        { ...erc20ABI, address: pos[3] as '0xstring', functionName: 'symbol' }
                    ]
                })
                const qouteFee = await simulateContract(config, {
                    ...positionManagerContract,
                    functionName: 'collect',
                    args: [{
                        tokenId: obj.result as bigint,
                        recipient: address as '0xstring',
                        amount0Max: BigInt("340282366920938463463374607431768211455"),
                        amount1Max: BigInt("340282366920938463463374607431768211455"),
                    }]
                })
                const liquidity = pos[7] as string
                const _currPrice = (Number(slot0[0]) / (2 ** 96)) ** 2
                const lowerTick = Number(pos[5])
                const upperTick = Number(pos[6])
                const _lowerPrice = Math.pow(1.0001, lowerTick)
                const _upperPrice = Math.pow(1.0001, upperTick)
                const _amount0 = calcAmount0(Number(liquidity), _currPrice, _lowerPrice, _upperPrice, 18, 18)
                const _amount1 = calcAmount1(Number(liquidity), _currPrice, _lowerPrice, _upperPrice, 18, 18)
                const _token0name = tokenName[0].status === 'success' ? String(tokenName[0].result) : ''
                const _token1name = tokenName[1].status === 'success' ? String(tokenName[1].result) : ''
                const _fee0 = qouteFee.result[0]
                const _fee1 = qouteFee.result[1]
                let token0addr
                let token1addr
                let token0name
                let token1name
                let amount0
                let amount1
                let lowerPrice
                let upperPrice
                let currPrice
                let fee0
                let fee1

                if (_token1name === 'WJBC') {
                    token0addr = pos[3]
                    token1addr = pos[2]
                    token0name = _token0name
                    token1name = _token1name
                    amount0 = _amount0 / 1e18
                    amount1 = _amount1 / 1e18
                    lowerPrice = 1 / _upperPrice
                    upperPrice = 1 / _lowerPrice
                    currPrice = 1 / _currPrice
                    fee0 = _fee0
                    fee1 = _fee1
                } else if (_token1name === 'CMJ' && _token0name !== 'WJBC') {
                    token0addr = pos[3]
                    token1addr = pos[2]
                    token0name = _token0name
                    token1name = _token1name
                    amount0 = _amount0 / 1e18
                    amount1 = _amount1 / 1e18
                    lowerPrice = 1 / _upperPrice
                    upperPrice = 1 / _lowerPrice
                    currPrice = 1 / _currPrice
                    fee0 = _fee0
                    fee1 = _fee1
                } else {
                    token0addr = pos[2]
                    token1addr = pos[3]
                    token0name = _token1name
                    token1name = _token0name
                    amount0 = _amount1 / 1e18
                    amount1 = _amount0 / 1e18
                    lowerPrice = _lowerPrice
                    upperPrice = _upperPrice
                    currPrice = _currPrice
                    fee0 = _fee1
                    fee1 = _fee0
                }

                return {
                    Id: Number(obj.result),
                    Name: String(metadata.name),
                    Image: String(metadata.image),
                    FeeTier: Number(pos[4]),
                    Pair: pairAddr as string,
                    Token0Addr: token0addr as string,
                    Token1Addr: token1addr as string,
                    Token0: token0name,
                    Token1: token1name,
                    Amount0: amount0,
                    Amount1: amount1,
                    MinPrice: lowerPrice,
                    MaxPrice: upperPrice,
                    CurrPrice: currPrice,
                    LowerTick: lowerTick,
                    UpperTick: upperTick,
                    Liquidity: liquidity,
                    Fee0: Number(fee0) / 1e18,
                    Fee1: Number(fee1) / 1e18
                }
            }))).filter((obj) => {
                return Number(obj.Liquidity) !== 0
            }).reverse()

            setPosition(myPosition)
        }

        setAmountA("")
        setAmountB("")
        address !== undefined && mode === 0 && fetchStateMode0()
        address !== undefined && mode === 1 && rangePercentage !== 999 && fetchStateMode1()
        address !== undefined &&  mode === 2 && fetchStateMode2()
    }, [config, address, mode, tokenA, tokenB, feeSelect, rangePercentage, txupdate])
    const clearState = () => {
        setTokenA(tokens[0])
        setTokenB({name: 'Choose Token', value: '' as '0xstring', logo: '/../favicon.png'})
        setFeeSelect(10000)
        setLowerTick("") 
        setUpperTick("")
        setLowerPrice("") 
        setUpperPrice("")
    }
    console.log({lowerTick, upperTick}) // for fetch monitoring

    return (
        <div className="h-[95vh] xl:h-[83vh] w-full flex flex-col items-center justify-start text-xs">
            {isAddPositionModal &&
                <div style={{zIndex: "998"}} className="centermodal">
                    <div className="wrapper">
                        <div className="pixel w-2/3 xl:w-1/3 h-3/4 xl:h-1/2 bg-neutral-900 p-10 gap-5 flex flex-col items-center justify-center text-sm text-left" style={{boxShadow: "6px 6px 0 #00000040"}}>
                            <span className='text-2xl'>Position #{positionSelected !== undefined ? positionSelected.Id : '...'} - Add Liquidity</span>
                            {Number(lowerPrice) < Number(currPrice) &&
                                <div className="w-full gap-1 flex flex-row items-center">
                                    <input className="p-4 bg-neutral-800 rounded-lg w-4/6 focus:outline-none" placeholder="0" value={amountA} onChange={e => {setAmountA(e.target.value); setAlignedAmountB(e.target.value);}} />
                                    <span className="w-2/6 font-semibold text-right text-gray-400">{Number(tokenABalance).toFixed(4)} {positionSelected !== undefined ? positionSelected.Token0 : '...'}</span>
                                </div>
                            }
                            {Number(upperPrice) > Number(currPrice) &&
                                <div className="w-full gap-1 flex flex-row items-center">
                                    <input className="p-4 bg-neutral-800 rounded-lg w-4/6 focus:outline-none" placeholder="0" value={amountB} onChange={e => {setAmountB(e.target.value); setAlignedAmountA(e.target.value);}} />
                                    <span className="w-2/6 font-semibold text-right text-gray-400">{Number(tokenBBalance).toFixed(4)} {positionSelected !== undefined ? positionSelected.Token1 : '...'}</span>
                                </div>
                            }
                            <button className="mt-2 p-4 bg-blue-500 rounded-full w-full bg-blue-500 text-lg font-bold hover:bg-blue-400" onClick={() => positionSelected !== undefined && increaseLiquidity(BigInt(positionSelected.Id))}>Increase Liquidity</button>
                            <button className="p-4 bg-blue-500 rounded-full w-full bg-slate-700 text-lg font-bold hover:bg-slate-600" onClick={() => {clearState(); setIsAddPositionModal(false);}}>Close</button>
                        </div>
                    </div>
                </div>
            }
            {isRemPositionModal &&
                <div style={{zIndex: "998"}} className="centermodal">
                    <div className="wrapper">
                        <div className="pixel w-2/3 xl:w-1/3 h-3/4 xl:h-1/2 bg-neutral-900 p-10 gap-5 flex flex-col items-center justify-center text-lg text-left" style={{boxShadow: "6px 6px 0 #00000040"}}>
                            <span className='text-2xl'>Position #{positionSelected !== undefined ? positionSelected.Id : '...'} - Remove Liquidity</span>
                            <div className="w-full gap-1 flex flex-row items-center">
                                <input className="p-4 bg-neutral-800 rounded-lg w-full focus:outline-none" type="text" placeholder="0" value={amountRemove} onChange={e => {setAmountRemove(e.target.value);}} />
                                <span className="w-2/6 font-semibold text-right text-gray-400">%</span>
                            </div>
                            <div className="w-full h-[100px] gap-2 flex flex-row">
                                <button className={"w-1/4 h-full p-3 rounded-lg border-2 border-gray-800 " + (amountRemove === '25' ? "bg-neutral-800" : "")} onClick={() => setAmountRemove('25')}>25%</button>
                                <button className={"w-1/4 h-full p-3 rounded-lg border-2 border-gray-800 " + (amountRemove === '50' ? "bg-neutral-800" : "")} onClick={() => setAmountRemove('50')}>50%</button>
                                <button className={"w-1/4 h-full p-3 rounded-lg border-2 border-gray-800 " + (amountRemove === '75' ? "bg-neutral-800" : "")} onClick={() => setAmountRemove('75')}>75%</button>
                                <button className={"w-1/4 h-full p-3 rounded-lg border-2 border-gray-800 " + (amountRemove === '100' ? "bg-neutral-800" : "")} onClick={() => setAmountRemove('100')}>100%</button>
                            </div>
                            <button 
                                className="mt-2 p-4 bg-blue-500 rounded-full w-full bg-blue-500 text-lg font-bold hover:bg-blue-400" 
                                onClick={() => 
                                    positionSelected !== undefined && 
                                        decreaseLiquidity(
                                            BigInt(positionSelected.Id), 
                                            amountRemove === '100' ? 
                                                BigInt(positionSelected.Liquidity) :
                                                BigInt(Number(positionSelected.Liquidity) * (Number(amountRemove)) / 100)
                                        )
                                }
                            >
                                Decrease Liquidity
                            </button>
                            <button className="p-4 bg-blue-500 rounded-full w-full bg-slate-700 text-lg font-bold hover:bg-slate-600" onClick={() => {setAmountRemove(''); setIsRemPositionModal(false);}}>Close</button>
                        </div>
                    </div>
                </div>
            }
            
            <div className="mt-[60px] pt-4 pb-6 px-6 w-full xl:w-1/3 h-[710px] gap-2 flex flex-col items-start justify-start bg-white/5 rounded-3xl mt-6 card">
                <div className="w-full gap-2 flex flex-row items-start justify-start" style={{zIndex: 1}}>
                    <button className={"p-2 w-1/3 xl:w-1/5 rounded-full hover:text-white hover:font-semibold " + (mode === 0 ? "bg-slate-700 font-bold" : "text-gray-500")} onClick={() => setMode(0)}>Instant Swap</button>
                    <button className={"p-2 w-1/3 xl:w-1/4 rounded-full hover:text-white hover:font-semibold " + (mode === 1 ? "bg-slate-700 font-bold" : "text-gray-500")} onClick={() => setMode(1)}>Add Liquidity</button>
                    <button className={"p-2 w-1/3 xl:w-1/5 rounded-full hover:text-white hover:font-semibold " + (mode === 2 ? "bg-slate-700 font-bold" : "text-gray-500")} onClick={() => setMode(2)}>My Position</button>
                </div>
                {mode === 0 &&
                    <>
                        <div className="p-6 w-full h-[180px] rounded-xl border border-solid border-gray-700 gap-2 flex flex-col relative" style={{zIndex: 2}}>
                            <span className="w-full text-left">From</span>
                            <div className="w-full gap-1 flex flex-row">
                                <input className="p-4 bg-transparent border border-gray-700 rounded-lg w-4/6 text-gray-500 text-[10px] focus:outline-none" placeholder="Token A" value={tokenA.value} onChange={e => setTokenA({name: 'Choose Token', value: e.target.value as '0xstring', logo: '/../favicon.png'})} />
                                <div className="w-2/6">
                                    <Listbox value={tokenA} onChange={setTokenA}>
                                        {({ open }) => {
                                            React.useEffect(() => {
                                                if (!open) {
                                                    setQuery('')
                                                }
                                            }, [open]);

                                            return (
                                                <>
                                                    <ListboxButton className="relative w-full h-full p-3 rounded-lg bg-white/5 text-left font-semibold gap-2 flex flex-row items-center focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25">
                                                        <img alt="" src={tokenA.logo} className="size-5 shrink-0 rounded-full" />
                                                        <span>{tokenA.name}</span>
                                                        <ChevronDownIcon className="pointer-events-none absolute top-4 right-4 size-4 fill-white/60" aria-hidden="true"/>
                                                    </ListboxButton>
                                                    <ListboxOptions anchor="bottom" transition className="w-[var(--button-width)] rounded-lg bg-neutral-800 p-1 text-gray-500 text-sm [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0" style={{zIndex: 2}}>
                                                        <input className="m-2 p-2 bg-white/5 rounded-lg w-6/7 text-gray-500 text-[10px] focus:outline-none" placeholder="Search Token" value={query} onChange={e => setQuery(e.target.value)} />
                                                        {filteredTokens.map(token => (
                                                            <ListboxOption key={token.name} value={token} className="cursor-pointer py-2 pr-9 pl-3 text-gray-500 data-[focus]:bg-white data-[focus]:font-semibold">
                                                                <div className="flex items-center">
                                                                    <img alt="" src={token.logo} className="size-5 shrink-0 rounded-full" />
                                                                    <span className="ml-3 truncate">{token.name}</span>
                                                                </div>
                                                            </ListboxOption>
                                                        ))}
                                                    </ListboxOptions>
                                                </>
                                            )
                                        }}
                                    </Listbox>
                                </div>
                            </div>
                            <div className="w-full gap-1 flex flex-row items-center">
                                <input className="p-4 rounded-lg bg-transparent w-4/6 font-bold focus:outline-none" autoFocus placeholder="0" value={amountA} onChange={e => {setAmountA(e.target.value); getQoute(e.target.value);}} />
                                {tokenA.name !== 'Choose Token' && 
                                    <button className="w-2/6 font-semibold text-right text-gray-400" onClick={() => {setAmountA(tokenABalance); getQoute(tokenABalance);}}>{Number(tokenABalance).toFixed(4)} {tokenA.name}</button>
                                }
                            </div>
                            <button className="self-center h-12 w-14 bg-black rounded-xl border-2 border-gray-500 absolute -bottom-7 hover:bg-neutral-800" onClick={switchToken}>
                                <ArrowDownIcon className="pointer-events-none absolute top-3 left-4 size-5 fill-white/60" aria-hidden="true"/>
                            </button>
                        </div>
                        <div className="p-6 mb-2 w-full h-[180px] rounded-xl bg-neutral-800 gap-2 flex flex-col" style={{zIndex: 1}}>
                            <span className="w-full text-left">To</span>
                            <div className="w-full gap-1 flex flex-row">
                                <input className="p-4 bg-transparent border border-gray-700 rounded-lg w-4/6 text-gray-500 text-[10px] focus:outline-none" placeholder="Token B" value={tokenB.value} onChange={e => setTokenB({name: 'Choose Token', value: e.target.value as '0xstring', logo: '/../favicon.png'})} />
                                <div className="w-2/6">
                                    <Listbox value={tokenB} onChange={setTokenB}>
                                        {({ open }) => {
                                            React.useEffect(() => {
                                                if (!open) {
                                                    setQuery('')
                                                }
                                            }, [open]);

                                            return (
                                                <>
                                                    <ListboxButton className="relative w-full h-full p-3 rounded-lg bg-white/5 text-left font-semibold gap-2 flex flex-row items-center focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25">
                                                        <img alt="" src={tokenB.logo} className="size-5 shrink-0 rounded-full" />
                                                        <span>{tokenB.name}</span>
                                                        <ChevronDownIcon className="pointer-events-none absolute top-4 right-4 size-4 fill-white/60" aria-hidden="true"/>
                                                    </ListboxButton>
                                                    <ListboxOptions anchor="bottom" transition className="w-[var(--button-width)] rounded-lg bg-neutral-800 p-1 text-gray-500 text-sm [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0" style={{zIndex: 1}}>
                                                        <input className="m-2 p-2 bg-white/5 rounded-lg w-6/7 text-gray-500 text-[10px] focus:outline-none" placeholder="Search Token" value={query} onChange={e => setQuery(e.target.value)} />
                                                        {filteredTokens.map((token) => (
                                                            <ListboxOption key={token.name} value={token} className="cursor-pointer py-2 pr-9 pl-3 text-gray-500 data-[focus]:bg-white data-[focus]:font-semibold">
                                                                <div className="flex items-center">
                                                                    <img alt="" src={token.logo} className="size-5 shrink-0 rounded-full" />
                                                                    <span className="ml-3 truncate">{token.name}</span>
                                                                </div>
                                                            </ListboxOption>
                                                        ))}
                                                    </ListboxOptions>
                                                </>
                                            )
                                        }}
                                    </Listbox>
                                </div>
                            </div>
                            <div className="w-full gap-1 flex flex-row items-center">
                                <input className="p-4 rounded-lg bg-transparent w-4/6 font-bold focus:outline-none" placeholder="0" value={amountB} readOnly />
                                {tokenB.value !== '' as '0xstring' && <span className="w-2/6 font-semibold text-right text-gray-400">{Number(tokenBBalance).toFixed(4)} {tokenB.name}</span>}
                            </div>
                        </div>
                        {altRoute !== undefined &&
                            <span className="w-full text-left text-gray-500">Route: {tokens.map(obj => obj.value).indexOf(altRoute.a) !== -1 && tokens[tokens.map(obj => obj.value).indexOf(altRoute.a)].name}  → {tokens.map(obj => obj.value).indexOf(altRoute.b) !== -1 && tokens[tokens.map(obj => obj.value).indexOf(altRoute.b)].name} → {tokens.map(obj => obj.value).indexOf(altRoute.c) !== -1 && tokens[tokens.map(obj => obj.value).indexOf(altRoute.c)].name}</span>
                        }
                        {tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' &&
                            <div className="gap-2 flex flex-row">
                                {exchangeRate !== '0' ? <span className="text-gray-500 font-bold">1 {tokenB.name} = {Number(exchangeRate).toFixed(4)} {tokenA.name}</span> : <span className="font-bold text-red-500">Insufficient Liquidity!</span>}
                                {Number(amountB) > 0 && 
                                    <span>[PI: {((Number(newPrice) * 100) / Number(exchangeRate)) - 100 <= 100 ? (((Number(newPrice) * 100) / Number(exchangeRate)) - 100).toFixed(4) : ">100"}%]</span>
                                } 
                            </div>
                        }
                        <span className="mt-2 w-full text-left">Swap fee tier</span>
                        <div className="w-full h-[70px] gap-2 flex flex-row text-gray-400" style={{zIndex: 1}}>
                            <button className={"w-1/2 h-full p-3 rounded-lg gap-3 flex flex-col items-center justify-center border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 100 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(100)}>
                                <span>0.01%</span>
                                {tokenB.value !== '' as '0xstring' && <span className={(Number(tvl100) > 0 ? 'text-emerald-300 font-bold' : '')}>TVL: {Intl.NumberFormat('en-US', { notation: "compact" , compactDisplay: "short" }).format(Number(tvl100))} {tokenB.name}</span>}
                            </button>
                            <button className={"w-1/2 h-full p-3 rounded-lg gap-3 flex flex-col items-center justify-center border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 500 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(500)}>
                                <span>0.05%</span>
                                {tokenB.value !== '' as '0xstring' && <span className={(Number(tvl500) > 0 ? 'text-emerald-300 font-bold' : '')}>TVL: {Intl.NumberFormat('en-US', { notation: "compact" , compactDisplay: "short" }).format(Number(tvl500))} {tokenB.name}</span>}
                            </button>
                        </div>
                        <div className="w-full mb-2 h-[70px] gap-2 flex flex-row text-gray-500" style={{zIndex: 1}}>
                            <button className={"w-1/2 h-full p-3 rounded-lg gap-3 flex flex-col items-center justify-center border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 3000 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(3000)}>
                                <span>0.3%</span>
                                {tokenB.value !== '' as '0xstring' && <span className={(Number(tvl3000) > 0 ? 'text-emerald-300 font-bold' : '')}>TVL: {Intl.NumberFormat('en-US', { notation: "compact" , compactDisplay: "short" }).format(Number(tvl3000))} {tokenB.name}</span>}
                            </button>
                            <button className={"w-1/2 h-full p-3 rounded-lg gap-3 flex flex-col items-center justify-center border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 10000 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(10000)}>
                                <span>1%</span>
                                {tokenB.value !== '' as '0xstring' && <span className={(Number(tvl10000) > 0 ? 'text-emerald-300 font-bold' : '')}>TVL: {Intl.NumberFormat('en-US', { notation: "compact" , compactDisplay: "short" }).format(Number(tvl10000))} {tokenB.name}</span>}
                            </button>
                        </div>
                        {tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && Number(amountA) !== 0 && Number(amountA) <= Number(tokenABalance) && Number(amountB) !== 0 ?
                            <button className="p-2 w-full h-[50px] rounded-full bg-blue-500 text-lg font-bold hover:bg-blue-400" style={{zIndex: 1}} onClick={swap}>Swap</button> :
                            <button className="p-2 w-full h-[50px] rounded-full bg-gray-500 text-lg font-bold inactive" style={{zIndex: 1}}>Swap</button>
                        }
                    </>
                }
                {mode === 1 &&
                    <>  
                        <div className="w-full gap-1 flex flex-row" style={{zIndex: 1}}>
                            <input className="p-4 bg-transparent border border-gray-800 rounded-lg w-4/6 text-gray-500 text-[10px] focus:outline-none" type="text" placeholder="Token A" value={tokenA.value} onChange={e => setTokenA({name: 'Choose Token', value: e.target.value as '0xstring', logo: '/../favicon.png'})} />
                            <div className="w-2/6">
                                <Listbox value={tokenA} onChange={setTokenA}>
                                    {({ open }) => {
                                        React.useEffect(() => {
                                            if (!open) {
                                                setQuery('')
                                            }
                                        }, [open]);

                                        return (
                                            <>
                                                <ListboxButton className="relative w-full h-full p-3 rounded-lg bg-white/5 text-left font-semibold gap-2 flex flex-row items-center focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25">
                                                    <img alt="" src={tokenA.logo} className="size-5 shrink-0 rounded-full" />
                                                    <span>{tokenA.name}</span>
                                                    <ChevronDownIcon className="pointer-events-none absolute top-4 right-4 size-4 fill-white/60" aria-hidden="true"/>
                                                </ListboxButton>
                                                <ListboxOptions anchor="bottom" transition className="w-[var(--button-width)] rounded-lg bg-neutral-800 p-1 text-gray-500 text-sm [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0" style={{zIndex: 1}}>
                                                    <input className="m-2 p-2 bg-white/5 rounded-lg w-6/7 text-gray-500 text-[10px] focus:outline-none" placeholder="Search Token" value={query} onChange={e => setQuery(e.target.value)} />
                                                    {filteredTokens.map((token) => (
                                                        <ListboxOption key={token.name} value={token} className="cursor-pointer py-2 pr-9 pl-3 text-gray-500 data-[focus]:bg-white data-[focus]:font-semibold">
                                                            <div className="flex items-center">
                                                                <img alt="" src={token.logo} className="size-5 shrink-0 rounded-full" />
                                                                <span className="ml-3 truncate">{token.name}</span>
                                                            </div>
                                                        </ListboxOption>
                                                    ))}
                                                </ListboxOptions>
                                            </>
                                        )
                                    }}
                                </Listbox>
                            </div>
                        </div>
                        {lowerPrice === '' || Number(lowerPrice) < Number(currPrice) &&
                            <div className="w-full gap-1 flex flex-row items-center" style={{zIndex: 1}}>
                                <input className="p-4 rounded-lg bg-transparent w-4/6 font-bold focus:outline-none" type="text" placeholder="0" value={amountA} onChange={(e) => {setAmountA(e.target.value); Number(upperPrice) > Number(currPrice) && setAlignedAmountB(e.target.value)}} />
                                {tokenA.value !== '' as '0xstring' && <button className="w-2/6 font-semibold text-right text-gray-400" onClick={() => setAmountA(tokenABalance)}>{Number(tokenABalance).toFixed(4)} {tokenA.name}</button>}
                            </div>
                        }
                        <div className="w-full gap-1 flex flex-row" style={{zIndex: 1}}>
                            <input className="p-4 bg-transparent border border-gray-800 rounded-lg w-4/6 text-gray-500 text-[10px] focus:outline-none" type="text" placeholder="Token B" value={tokenB.value} onChange={e => setTokenB({name: 'Choose Token', value: e.target.value as '0xstring', logo: '/../favicon.png'})} />
                            <div className="w-2/6">
                                <Listbox value={tokenB} onChange={setTokenB}>
                                    {({ open }) => {
                                        React.useEffect(() => {
                                            if (!open) {
                                                setQuery('')
                                            }
                                        }, [open]);

                                        return (
                                            <>
                                                <ListboxButton className="relative w-full h-full p-3 rounded-lg bg-white/5 text-left font-semibold gap-2 flex flex-row items-center focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25">
                                                    <img alt="" src={tokenB.logo} className="size-5 shrink-0 rounded-full" />
                                                    <span>{tokenB.name}</span>
                                                    <ChevronDownIcon className="pointer-events-none absolute top-4 right-4 size-4 fill-white/60" aria-hidden="true"/>
                                                </ListboxButton>
                                                <ListboxOptions anchor="bottom" transition className="w-[var(--button-width)] rounded-lg bg-neutral-800 p-1 text-gray-500 text-sm [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0" style={{zIndex: 1}}>
                                                    <input className="m-2 p-2 bg-white/5 rounded-lg w-6/7 text-gray-500 text-[10px] focus:outline-none" placeholder="Search Token" value={query} onChange={e => setQuery(e.target.value)} />
                                                    {filteredTokens.map((token) => (
                                                        <ListboxOption key={token.name} value={token} className="cursor-pointer py-2 pr-9 pl-3 text-gray-500 data-[focus]:bg-white data-[focus]:font-semibold">
                                                            <div className="flex items-center">
                                                                <img alt="" src={token.logo} className="size-5 shrink-0 rounded-full" />
                                                                <span className="ml-3 truncate">{token.name}</span>
                                                            </div>
                                                        </ListboxOption>
                                                    ))}
                                                </ListboxOptions>
                                            </>
                                        )
                                    }}
                                </Listbox>
                            </div>
                        </div>
                        {upperPrice === '' || Number(upperPrice) > Number(currPrice) &&
                            <div className="w-full gap-1 flex flex-row items-center" style={{zIndex: 1}}>
                                <input className="p-4 rounded-lg bg-transparent w-4/6 font-bold focus:outline-none" type="text" placeholder="0" value={amountB} onChange={(e) => setAmountB(e.target.value)} />
                                {tokenB.value !== '' as '0xstring' && <button className="w-2/6 font-semibold text-right text-gray-400" onClick={() => setAmountB(tokenBBalance)}>{Number(tokenBBalance).toFixed(4)} {tokenB.name}</button>}
                            </div>
                        }
                        <div className="w-full h-[100px] gap-2 flex flex-row text-gray-400" style={{zIndex: 1}}>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 100 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(100)}>
                                <span>0.01%</span>
                                <span className="text-gray-500">Best for very stable pairs</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 500 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(500)}>
                                <span>0.05%</span>
                                <span className="text-gray-500">Best for stable pairs</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 3000 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(3000)}>
                                <span>0.3%</span>
                                <span className="text-gray-500">Best for most pairs</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (feeSelect === 10000 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setFeeSelect(10000)}>
                                <span>1%</span>
                                <span className="text-gray-500">Best for exotic pairs</span>
                            </button>
                        </div>
                        <span className="m-2 font-semibold">Current price: {Number(currPrice).toFixed(4)} {tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && tokenA.name + '/' + tokenB.name}</span>
                        <div className="w-full h-[100px] gap-2 flex flex-row text-gray-400" style={{zIndex: 1}}>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (rangePercentage === 1 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setRangePercentage(1)}>
                                <span>Full Range</span>
                                <span className="text-gray-500">[-100%, ♾️]</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (rangePercentage === 0.15 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setRangePercentage(0.15)}>
                                <span>Wide</span>
                                <span className="text-gray-500">[-15%, +15%]</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (rangePercentage === 0.075 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setRangePercentage(0.075)}>
                                <span>Narrow</span>
                                <span className="text-gray-500">[-7.5%, +7.5%]</span>
                            </button>
                            <button className={"w-1/4 h-full p-3 rounded-lg gap-3 flex flex-col justify-start border border-gray-800 hover:text-white hover:bg-neutral-800 " + (rangePercentage === 0.02 ? "bg-white/5 text-white border-slate-500" : "")} onClick={() => setRangePercentage(0.02)}>
                                <span>Degen</span>
                                <span className="text-gray-500">[-2%, +2%]</span>
                            </button>
                        </div>
                        {pairDetect === '0x0000000000000000000000000000000000000000' &&
                            <div className="w-full gap-1 flex flex-row items-center" style={{zIndex: 1}}>
                                <input className="p-4 bg-neutral-900 rounded-lg w-4/6 focus:outline-none" placeholder="Initial Price" value={currPrice} onChange={e => setCurrPrice(e.target.value)} />
                                <span className="w-2/6 text-right text-gray-500">{tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && tokenA.name + '/' + tokenB.name}</span>
                            </div>
                        }
                        <div className="w-full gap-1 flex flex-row items-center" style={{zIndex: 1}}>
                            <input className="p-4 bg-neutral-900 rounded-lg w-4/6 focus:outline-none" placeholder="Lower Price" value={lowerPrice} onChange={e => {setLowerPrice(e.target.value); setAlignedLowerTick(e.target.value); setRangePercentage(999);}} />
                            <span className="w-2/6 text-right text-gray-500">{tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && tokenA.name + '/' + tokenB.name + (Number(currPrice) > 0 ? ' (' + Number(lowerPercentage).toFixed(2) + '%)' : '')}</span>
                        </div>
                        <div className="w-full gap-1 flex flex-row items-center" style={{zIndex: 1}}>
                            <input className="p-4 bg-neutral-900 rounded-lg w-4/6 focus:outline-none" placeholder="Upper Price" value={upperPrice} onChange={e => {setUpperPrice(e.target.value); setAlignedUpperTick(e.target.value); setRangePercentage(999);}} />
                            <span className="w-2/6 text-right text-gray-500">{tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && tokenA.name + '/' + tokenB.name + (Number(currPrice) > 0 ? ' (+' + Number(upperPercentage).toFixed(2) + '%)' : '')}</span>
                        </div>
                        {tokenA.value !== '' as '0xstring' && tokenB.value !== '' as '0xstring' && Number(amountA) <= Number(tokenABalance) && Number(amountB) <= Number(tokenBBalance) ?
                            <button className="mt-2 p-4 rounded-full w-full bg-blue-500 text-lg font-bold hover:bg-blue-400" style={{zIndex: 1}} onClick={placeLiquidity}>Add Liquidity</button> :
                            <button className="mt-2 p-4 rounded-full w-full bg-gray-600 text-lg font-bold inactive" style={{zIndex: 1}}>Add Liquidity</button>
                        }
                    </>
                }
                {mode === 2 && position[0] !== undefined &&
                    <div className="w-full h-[80vh] gap-5 flex flex-col overflow-y-scroll pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-lg [&::-webkit-scrollbar-track]:bg-neutral-900 [&::-webkit-scrollbar-thumb]:rounded-xl [&::-webkit-scrollbar-thumb]:bg-zinc-800" style={{zIndex: 1}}>
                        {position.map(obj => 
                            <div key={Number(obj.Id)} className="w-full h-[350px] bg-neutral-900 border border-gray-800 rounded-xl gap-2 flex flex-col items-start">
                                <div className="w-full py-4 h-[242px] bg-white/5 rounded-t-xl relative inset-0 h-full w-full bg-white/5 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]">
                                    <img alt="" src={obj.Image} height={100} width={100} className="place-self-center" />
                                    <span className="absolute bottom-5 left-5">{obj.CurrPrice > obj.MinPrice && obj.CurrPrice < obj.MaxPrice ? 'In range' : 'Out of range'}</span>
                                    <span className="absolute bottom-5 right-5">{obj.FeeTier / 10000}%</span>
                                </div>
                                <div className="w-full h-[20px] py-2 px-6 flex flex-row justify-between">
                                    <span className="text-gray-500">Position #{obj.Id}</span>
                                    <span>{obj.Amount0.toFixed(4)} <span className="text-gray-500">{obj.Token0} /</span> {obj.Amount1.toFixed(4)} <span className="text-gray-500">{obj.Token1}</span></span>
                                </div>
                                <div className="w-full h-[20px] py-2 px-6 flex flex-row justify-between">
                                    <span className="text-gray-500">Fee</span>
                                    <span>{obj.Fee0.toFixed(4)} <span className="text-gray-500">{obj.Token0} /</span> {obj.Fee1.toFixed(4)} <span className="text-gray-500">{obj.Token1}</span></span>
                                </div>
                                <div className="w-full h-[20px] py-2 px-6 flex flex-row justify-between">
                                    <span className="text-gray-500">Current : Min : Max</span>
                                    <span>{obj.CurrPrice.toFixed(4)} : {obj.MinPrice.toFixed(4)} : {obj.MaxPrice > 1e18 ? '♾️' : obj.MaxPrice.toFixed(4)} <span className="text-gray-500">{obj.Token0}/{obj.Token1}</span></span>
                                </div>
                                <div className="w-full h-[50px] mb-4 py-2 px-6 gap-2 flex flex-row items-start justify-start font-semibold">
                                    <button 
                                        className="px-2 py-1 w-1/4 rounded-full bg-blue-500 hover:bg-blue-400" 
                                        onClick={() => {
                                            setPositionSelected(obj)
                                            setTokenA({name: "", logo: "", value: obj.Token0Addr as '0xstring'})
                                            setTokenB({name: "", logo: "", value: obj.Token1Addr as '0xstring'})
                                            getBalanceOfAB(obj.Token0Addr as '0xstring', obj.Token1Addr as '0xstring')
                                            setPairDetect(obj.Pair); setFeeSelect(obj.FeeTier)
                                            setLowerTick(obj.LowerTick.toString())
                                            setUpperTick(obj.UpperTick.toString())
                                            setCurrPrice(obj.CurrPrice.toString())
                                            setLowerPrice(obj.MinPrice.toString())
                                            setUpperPrice(obj.MaxPrice.toString())
                                            setIsAddPositionModal(true)
                                        }}
                                    >
                                        Add Liquidity
                                    </button>
                                    <button className="px-2 py-1 w-1/4 rounded-full bg-blue-500 hover:bg-blue-400" onClick={() => {setPositionSelected(obj); setIsRemPositionModal(true);}}>Remove Liquidity</button>
                                    {Number(obj.Fee0) > 0 && Number(obj.Fee1) > 0 && 
                                        <button className="px-3 py-1 w-1/5 rounded-full bg-blue-500 hover:bg-blue-400" onClick={() => collectFee(BigInt(obj.Id))}>Collect fee</button>
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                }
            </div>
        </div>
    )
}
