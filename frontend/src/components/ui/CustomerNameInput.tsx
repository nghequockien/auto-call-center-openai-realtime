import React from "react";

interface CustomerNameInputProps {
    value: string;
    onChange: (value: string) => void;
}

const CustomerNameInput: React.FC<CustomerNameInputProps> = ({ value, onChange }) => {
    return (
        <div className="mb-4 flex flex-col">
            <label className="mb-1 block text-sm font-medium text-gray-700">Customer Name (坂本、鈴木、...)</label>
            <input
                type="text"
                className="w-80 rounded border px-3 py-2"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Enter customer name"
            />
        </div>
    );
};

export default CustomerNameInput;
