import React from 'react';
import { formatTimestamp } from '../utils/dateUtils';

function Graph({ data }) {
    const processedData = processGraphData(data);

    return (
        <div>
            {processedData.map(entry => (
                <div key={entry.timestamp}>
                    <span>{entry.formattedTime}</span>: <span>{entry.value}</span>
                </div>
            ))}
        </div>
    );
}

function processGraphData(data) {
    return data.map(entry => ({
        ...entry,
        formattedTime: formatTimestamp(entry.timestamp, 'Europe/Rome'), // Corregge il fuso orario
    }));
}

export default Graph;