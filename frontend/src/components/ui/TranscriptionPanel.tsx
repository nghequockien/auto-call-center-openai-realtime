import React from "react";

interface TranscriptionPanelProps {
    transcription: string;
}

const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({ transcription }) => {
    return (
        <div className="flex-col rounded shadow">
            <h2 className="mb-2 text-lg font-semibold">Transcription</h2>
            <div className="flex-1 overflow-y-auto whitespace-pre-line text-gray-800">
                {transcription ? transcription : <span className="text-gray-400">No transcription yet.</span>}
            </div>
        </div>
    );
};

export default TranscriptionPanel;
