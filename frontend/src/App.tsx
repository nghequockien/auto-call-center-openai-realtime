import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { GroundingFiles } from "@/components/ui/grounding-files";
import GroundingFileView from "@/components/ui/grounding-file-view";
import StatusMessage from "@/components/ui/status-message";

import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useAudioPlayer from "@/hooks/useAudioPlayer";

import CustomerNameInput from "@/components/ui/CustomerNameInput";
import IntentInput from "@/components/ui/IntentInput";
import TranscriptionPanel from "@/components/ui/TranscriptionPanel";
import { GroundingFile, ToolResult } from "./types";

import logo from "./assets/MetLife.png";

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [groundingFiles, setGroundingFiles] = useState<GroundingFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<GroundingFile | null>(null);
    const [customerName, setCustomerName] = useState("");
    const [intent, setIntent] = useState("");
    const [transcription, setTranscription] = useState("");

    const { startSession, addUserAudio, inputAudioBufferClear, sendGettingMessage } = useRealTime({
        onWebSocketOpen: () => console.log("WebSocket connection opened"),
        onWebSocketClose: () => console.log("WebSocket connection closed"),
        onWebSocketError: event => console.error("WebSocket error:", event),
        onReceivedError: message => console.error("error", message),
        onReceivedResponseAudioDelta: message => {
            isRecording && playAudio(message.delta);
        },
        onReceivedInputAudioBufferSpeechStarted: () => {
            stopAudioPlayer();
        },
        onReceivedExtensionMiddleTierToolResponse: message => {
            const result: ToolResult = JSON.parse(message.tool_result);

            const files: GroundingFile[] = result.sources.map(x => {
                return { id: x.chunk_id, name: x.title, content: x.chunk };
            });

            setGroundingFiles(prev => [...prev, ...files]);
        },
        onReceivedResponseAudioTranscriptDone: message => {
            setTranscription(prev => prev + "\n[BOT]: " + message.transcript);
        },
        onReceivedInputAudioTranscriptionCompleted: message => {
            setTranscription(prev => prev + "\n[Customer]: " + message.transcript);
        }
    });

    const { reset: resetAudioPlayer, play: playAudio, stop: stopAudioPlayer } = useAudioPlayer();
    const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder({ onAudioRecorded: addUserAudio });

    const onToggleListening = async () => {
        if (!isRecording) {
            if (!customerName.trim() || !intent.trim()) {
                alert("Please enter both customer name and intent.");
                return;
            }
            setTranscription("");
            startSession();
            // Pass customerName and intent to sendGettingMessage and wait for it to complete
            await sendGettingMessage(customerName, intent);
            //
            await startAudioRecording();
            resetAudioPlayer();

            setIsRecording(true);
        } else {
            await stopAudioRecording();
            stopAudioPlayer();
            inputAudioBufferClear();

            setIsRecording(false);
        }
    };

    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
            <div className="p-4 sm:left-4 sm:top-4">
                <img src={logo} alt="Azure logo" />
            </div>
            <h1 className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-4xl font-bold text-transparent md:text-7xl">{t("app.title")}</h1>
            <main className="flex w-full flex-grow flex-row items-start">
                <div className="flex w-1/3 flex-col items-center">
                    <CustomerNameInput value={customerName} onChange={setCustomerName} />
                    <IntentInput value={intent} onChange={setIntent} />
                    <Button
                        onClick={onToggleListening}
                        className={`h-12 w-80 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                        aria-label={isRecording ? t("app.stopRecording") : t("app.startRecording")}
                    >
                        {isRecording ? (
                            <>
                                <MicOff className="mr-2 h-4 w-4" />
                                {t("app.stopConversation")}
                            </>
                        ) : (
                            <>
                                <Mic className="mr-2 h-6 w-6" />
                            </>
                        )}
                    </Button>
                    <StatusMessage isRecording={isRecording} />
                </div>
                <div className="flex w-2/3 flex-col">
                    <TranscriptionPanel transcription={transcription} />
                </div>
            </main>

            <div className="flex flex-auto flex-col items-center">
                <GroundingFiles files={groundingFiles} onSelected={setSelectedFile} />
            </div>

            <footer className="py-4 text-center">
                <p>{t("app.footer")}</p>
            </footer>

            <GroundingFileView groundingFile={selectedFile} onClosed={() => setSelectedFile(null)} />
        </div>
    );
}

export default App;
