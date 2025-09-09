import React from "react";

interface IntentInputProps {
    value: string;
    onChange: (value: string) => void;
}

const IntentInput: React.FC<IntentInputProps> = ({ value, onChange }) => {
    return (
        <div className="mb-4 flex flex-col">
            <label className="mb-1 block text-sm font-medium text-gray-700">Intent (住所変更、口座変更、...)</label>
            <input
                type="text"
                className="w-80 rounded border px-3 py-2"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Enter intent (e.g. name_change)"
            />
        </div>
    );
};

export default IntentInput;
