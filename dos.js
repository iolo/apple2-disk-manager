const BYTES_PER_SECTOR = 256;
const TRACKS_PER_DISK = 35;
const SECTORS_PER_TRACK = 16;
const VTOC_TRACK = 17;
const VTOC_SECTOR = 0;

export class DosDisk {
  /** @param {Uint8ClampedArray} data */
  constructor(data) {
    this.data = data;
  }

  /** @returns {DosFile[]} */
  listFiles() {
    console.log('list files in dos disk...');
    const vtoc = this.readVtoc();
    if (!vtoc) {
      return [];
    }
    return this.readCatalog(vtoc.firstCatalogTrack, vtoc.firstCatalogSector);
  }

  /**
   * read DOS 3.3 256 byte sector
   *
   * @param {number} track
   * @param {number} sector
   * @returns {Uint8ClampedArray|null}
   */
  readSector(track, sector) {
    if (!this.data) return null;
    if (track < 0 || track >= TRACKS_PER_DISK) return null;
    if (sector < 0 || sector >= SECTORS_PER_TRACK) return null;

    const offset = (track * SECTORS_PER_TRACK + sector) * BYTES_PER_SECTOR;
    return this.data.slice(offset, offset + BYTES_PER_SECTOR);
  }

  readVtoc() {
    const vtocData = this.readSector(VTOC_TRACK, VTOC_SECTOR);
    if (!vtocData) return null;

    return {
      dosVersion: vtocData[3],
      volumeNumber: vtocData[6],
      tracksPerDisk: vtocData[0x34],
      sectorsPerTrack: vtocData[0x35],
      bytesPerSector: vtocData[0x36] + (vtocData[0x37] << 8),
      firstCatalogTrack: vtocData[1],
      firstCatalogSector: vtocData[2],
      freeSectors: {
        count: vtocData[0x31] + (vtocData[0x32] << 8),
        bitmap: Array.from({ length: 35 }, (_, i) => {
          const byte = vtocData[0x38 + i];
          return Array.from({ length: 8 }, (_, j) => !!(byte & (1 << j)));
        }),
      },
    };
  }

  readCatalog(firstCatalogTrack, firstCatalogSector) {
    let track = firstCatalogTrack;
    let sector = firstCatalogSector;
    const fileEntries = [];

    while (track !== 0) {
      const catalogSector = this.readCatalogSector(track, sector);
      if (!catalogSector) break;

      const validEntries = catalogSector.entries.filter((entry) => entry.track !== 0 && entry.track !== 255);
      fileEntries.push(...validEntries);

      track = catalogSector.nextTrack;
      sector = catalogSector.nextSector;
    }

    return fileEntries;
  }

  readCatalogSector(track, sector) {
    const sectorData = this.readSector(track, sector);
    if (!sectorData) return null;

    return {
      nextTrack: sectorData[0x01],
      nextSector: sectorData[0x02],
      entries: Array.from({ length: 7 }, (_, i) => {
        const offset = 0x0b + i * 0x23;
        const entryData = sectorData.slice(offset, offset + 0x23);
        return this.parseCatalogEntry(entryData);
      }),
    };
  }

  parseCatalogEntry(entryData) {
    const fileName = Array.from(entryData.slice(3, 0x13))
      .map((b) => (b === 0xa0 ? ' ' : String.fromCharCode(b & 0x7f)))
      .join('')
      .trim();
    return new DosFile(this, {
      raw: entryData,
      track: entryData[0],
      sector: entryData[1],
      fileType: entryData[2],
      fileName, //: entryData.slice(3, 0x13),
      sectorCount: entryData[0x21] + (entryData[0x22] << 8),
      // Store track/sector list for file content reading
      tsListTrack: entryData[0],
      tsListSector: entryData[1],
    });
  }
}

class DosFile {
  constructor(disk, attrs) {
    this.disk = disk;
    this.attrs = attrs;
  }

  get name() {
    return this.attrs.fileName;
  }

  get size() {
    // apple dos doesn't store file size, so we calculate it
    return this.attrs.sectorCount * BYTES_PER_SECTOR;
  }

  get type() {
    return this.parseFileType(this.attrs.fileType);
  }

  get flags() {
    return this.parseFileFlags(this.attrs.raw[2]);
  }

  get content() {
    // Read T/S List sector
    const tsListData = this.disk.readSector(this.attrs.tsListTrack, this.attrs.tsListSector);
    if (!tsListData) return null;
    const fileData = [];
    // Each T/S List sector can point to up to 122 sectors (244 bytes of T/S pairs)
    for (let i = 0; i < 122; i++) {
      const trackOffset = 12 + i * 2;
      const sectorOffset = trackOffset + 1;

      const track = tsListData[trackOffset];
      const sector = tsListData[sectorOffset];

      // Track 0 means end of file
      if (track === 0) break;

      const sectorData = this.disk.readSector(track, sector);
      if (sectorData) {
        fileData.push(...sectorData);
      }
    }
    return fileData;
  }

  // TODO: ...
  parseFileType(fileType) {
    return fileType.toString(16).padStart(2, '0');
  }

  // TODO: ...
  parseFileFlags(fileFlags) {
    return fileFlags.toString(16).padStart(2, '0');
  }
}
