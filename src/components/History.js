import React from 'react';
import { formatTimestamp, formatTimestampForFile } from '../utils/dateUtils';

function History({ data }) {
    const processedData = processHistoryData(data);

    return (
        <div>
            <h2>History</h2>
            <ul>
                {processedData.map(entry => (
                    <li key={entry.id}>
                        {entry.value} - {entry.formattedTime}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function processHistoryData(data) {
    return data.map(entry => ({
        ...entry,
        formattedTime: formatTimestamp(entry.timestamp, 'Europe/Rome'),
    }));
}

export function prepareDownloadData(data) {
    return data.map(entry => ({
        ...entry,
        timestamp: formatTimestampForFile(entry.timestamp), // Corregge il formato per i file
    }));
}

export default History;