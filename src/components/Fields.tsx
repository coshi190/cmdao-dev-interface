import type { NavigateFunction } from 'react-router-dom'

export default function Fields({ callMode, navigate }: {callMode: (_mode: number) => void, navigate: NavigateFunction}) {
    window.scrollTo(0, 0)
    
    return (
        <div className='w-full h-[95vh] xl:h-[83vh]'>
            <div className="w-full h-[250px] mt-10 px-14 flex flex-row items-center justify-between">
                <div style={{fontSize: "65px", width: "fit-content"}} className="pixel">Fields V2</div>
                <img src="./fieldlogo.png" width="150" alt="Fields_Logo" />
            </div>
            <div className='w-full my-2 px-10 border-[0.5px] border-solid border-gray-800' />
            <div className="w-full my-8 px-10 flex flex-row items-start justify-start">
                <div className="w-full xl:w-1/4 h-[450px] bg-neutral-800 gap-8 flex flex-col items-center justify-center rounded-xl" style={{backgroundImage: "url('https://gateway.commudao.xyz/ipfs/bafybeicyixoicb7ai6zads6t5k6qpyocoyelfbyoi73nmtobfjlv7fseiq')"}}>
                    <img src="https://gateway.commudao.xyz/ipfs/bafybeicyixoicb7ai6zads6t5k6qpyocoyelfbyoi73nmtobfjlv7fseiq" height="250" width="300" alt="Field001" />
                    <button className="pixel w-3/4 rounded-xl text-lg text-black p-2 bg-emerald-400 hover:bg-emerald-300 hover:font-bold" onClick={() => {callMode(11); navigate('/fields/cmdao-valley');}}>Go to CMDAO Valley</button>
                </div>
            </div>
            <div className='w-full my-2 px-10 border-[0.5px] border-solid border-gray-800' />
        </div>
    )
}
