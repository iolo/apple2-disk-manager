import { DosDisk } from './dos.js';
import { ProdosDisk } from './prodos.js';

function formatHexDump(data) {
  const lines = [];
  for (let offset = 0; offset < data.length; offset += 16) {
    // Get 16 bytes for this line
    const bytes = data.slice(offset, offset + 16);

    // Format hex part
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    // Format ASCII part
    const ascii = Array.from(bytes)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');

    // Combine offset, hex, and ASCII
    const offsetHex = offset.toString(16).padStart(4, '0');
    const paddedHex = hex.padEnd(16 * 3 - 1, ' ');
    lines.push(`${offsetHex}: ${paddedHex}  |${ascii}|`);
  }
  return lines.join('\n');
}

document.getElementById('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8ClampedArray(arrayBuffer);
    console.log(`Read ${data.length} bytes`);

    const tbody = document.querySelector('#fileTable tbody');
    tbody.innerHTML = '';

    const disk = /.(po|hdv|2mg)$/i.test(file.name) ? new ProdosDisk(data) : new DosDisk(data);
    const entries = disk.listFiles();

    for (const entry of entries) {
      const row = tbody.insertRow();
      row.insertCell().textContent = entry.name;
      row.insertCell().textContent = entry.size;
      row.insertCell().textContent = entry.type;
      row.insertCell().textContent = entry.flags;
      row.addEventListener('click', () => {
        tbody.querySelectorAll('tr').forEach((r) => (r.style.backgroundColor = ''));
        row.style.backgroundColor = '#e0e0e0';

        const content = entry.content;
        if (content) {
          document.getElementById('fileContent').textContent = formatHexDump(content);
        } else {
          document.getElementById('fileContent').textContent = 'Error reading file content';
        }
      });
    }
  } catch (error) {
    console.error('Error reading file:', error);
  }
});
