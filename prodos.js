const PRODOS_BLOCK_SIZE = 512;

const PRODOS_ENTRY_SIZE = 0x27;

const PRODOS_FIRST_VOLUME_DIRECTORY_BLOCK = 2;

const ProdosStorageType = {
  DELETED: 0x00,
  SEEDLING: 0x10,
  SAPLING: 0x20,
  TREE: 0x30,
  PASCAL: 0x40,
  GSOS: 0x50,
  SUBDIRECTORY: 0xd0,
  SUBDIRECTORY_HEADER: 0xe0,
  VOLUME_DIRECTORY_HEADER: 0xf0,
};

export class ProdosDisk {
  /** @param {Uint8ClampedArray} data */
  constructor(data) {
    this.data = data;
  }

  /** @returns {ProdosFile[]} */
  listFiles() {
    console.log('list files in prodos disk...');
    // boot sector
    // readBlock(0);

    // SOS boot loader(for apple3)
    // readBlock(1);

    return this.readVolumeDirectory(PRODOS_FIRST_VOLUME_DIRECTORY_BLOCK);
  }

  readVolumeDirectory(block) {
    const entries = [];
    while (block) {
      const volDir = this.readBlock(block);
      //const prevVolDirBlock = volDir[0] | (volDir[1] << 8);
      const nextVolDirBlock = volDir[2] | (volDir[3] << 8);
      // parse directory entries
      let offset = 4;
      while (offset < PRODOS_BLOCK_SIZE) {
        const entryData = volDir.slice(offset, offset + PRODOS_ENTRY_SIZE);
        const entry = this.parseEntry(entryData);
        if (entry) {
          entries.push(entry);
        }
        offset += PRODOS_ENTRY_SIZE;
      }
      block = nextVolDirBlock;
    }
    return entries;
  }

  parseEntry(entry) {
    //  $00: deleted entry
    //  $01: seedling - key block holds data (0-512 bytes)
    //  $02: sapling - key block is list of data blocks (513-131072 bytes)
    //  $03: tree - key block is list of index blocks (128KB-16MB)
    //  $04: Pascal area on ProFile hard disk drive (see ProDOS 8 TN #25)
    //  $05: GS/OS forked file
    //  $0d: subdirectory
    //  $0e: subdirectory header entry
    //  $0f: volume directory header entry
    const storageType = entry[0] & 0xf0;
    const nameLength = entry[0] & 0x0f;
    if (nameLength === 0) {
      return null;
    }
    const name = Array.from(entry.slice(0x01, 0x01 + nameLength))
      .map((b) => (b === 0 ? ' ' : String.fromCharCode(b)))
      .join('')
      .trim();
    if (name === '') {
      return null;
    }
    switch (storageType) {
      case ProdosStorageType.DELETED:
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
        });
      case ProdosStorageType.SEEDLING: // key block holds data (1~512)
      case ProdosStorageType.SAPLING: // key block is list of data blocks (513~131072)
      case ProdosStorageType.TREE: // key block is list of sapling blocks (131073~16MB)
        // +$00 / 1: storage type / name length
        // +$01 /15: file name (A-Z, 0-9, '.', must start with letter)
        // +$10 / 1: file type
        // +$11 / 2: key pointer (block number where storage begins)
        // +$13 / 2: blocks used
        // +$15 / 3: EOF
        // +$18 / 4: creation date/time
        // +$1c / 4: version/min-version -OR- lower-case flags (see TN.GSOS.008)
        // +$1e / 1: access flags
        // +$1f / 2: aux type
        // +$21 / 4: modification date/time
        // +$25 / 2: header pointer (key block number of directory that holds this file)
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
          fileType: entry[0x10],
          keyPointer: entry[0x11] | (entry[0x12] << 8),
          blocksUsed: entry[0x13] | (entry[0x14] << 8),
          eof: entry[0x15] | (entry[0x16] << 8) | (entry[0x17] << 16),
          creationTime: this.parseTimestamp(entry.slice(0x18, 0x18 + 4)),
          version: entry[0x1c],
          minVersion: entry[0x1d],
          accessFlags: this.parseAccessFlags(entry[0x1e]),
          auxType: entry[0x1f] | (entry[0x20] << 8),
          modificationTime: this.parseTimestamp(entry.slice(0x21, 0x21 + 4)),
          headerPointer: entry[0x25] | (entry[0x26] << 8),
        });
      case ProdosStorageType.PASCAL: // pascal area on profile hard disk drive(prodos 8 TN#25)
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
        });
      case ProdosStorageType.GSOS: // GS/OS forked file
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
        });
      case ProdosStorageType.SUBDIRECTORY:
        // +$00 / 1: storage type / name length
        // +$01 /15: file name (A-Z, 0-9, '.', must start with letter)
        // +$10 / 1: file type
        // +$11 / 2: key pointer (block number where storage begins)
        // +$13 / 2: blocks used
        // +$15 / 3: EOF
        // +$18 / 4: creation date/time
        // +$1c / 4: version/min-version -OR- lower-case flags (see TN.GSOS.008)
        // +$1e / 1: access flags
        // +$1f / 2: aux type
        // +$21 / 4: modification date/time
        // +$25 / 2: header pointer (key block number of directory that holds this file)
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
          fileType: entry[0x10],
          keyPointer: entry[0x11] | (entry[0x12] << 8),
          blocksUsed: entry[0x13] | (entry[0x14] << 8),
          eof: entry[0x15] | (entry[0x16] << 8) | (entry[0x17] << 16),
          creationTime: this.parseTimestamp(entry.slice(0x18, 0x18 + 4)),
          version: entry[0x1c],
          minVersion: entry[0x1d],
          accessFlags: this.parseAccessFlags(entry[0x1e]),
          auxType: entry[0x1f] | (entry[0x20] << 8),
          modificationTime: this.parseTimestamp(entry.slice(0x21, 0x21 + 4)),
          headerPointer: entry[0x25] | (entry[0x26] << 8),
        });
      case ProdosStorageType.SUBDIRECTORY_HEADER:
        // +$00 / 1: storage type / name length ($Ex)
        // +$01 /15: subdirectory name (redundant)
        // +$10 / 1: (reserved, must contain $75 for P8, or $76 for GS/OS)
        // +$11 / 7: (reserved, should be zeroes)
        // +$18 / 4: creation date/time of this directory (redundant, not updated)
        // +$1c / 4: version/min-version (not used for lower-case flags)
        // +$1e / 1: access flags (redundant, not updated)
        // +$1f / 1: directory entry length (usually $27)
        // +$20 / 1: entries per directory block (usually $200/$27 = $0d)
        // +$21 / 2: number of active entries in directory (not including header)
        // +$23 / 2: parent pointer (block of directory with entry for this dir; NOT key block)
        // +$25 / 1: parent entry number (entry number within parent directory block, 1-N)
        // +$26 / 1: parent entry length (length of entries in parent dir, should be $27)
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
          creationTime: this.parseTimestamp(entry.slice(0x18, 0x18 + 4)),
          version: entry[0x1c],
          minVersion: entry[0x1d],
          accessFlags: this.parseAccessFlags(entry[0x1e]),
          directoryEntryLength: entry[0x1f],
          entriesPerDirectoryBlock: entry[0x20],
          numActiveEntries: entry[0x21] | (entry[0x22] << 8),
          parentPointer: entry[0x23] | (entry[0x24] << 8),
          parentEntryNumber: entry[0x25],
          parentEntryLength: entry[0x26],
        });
      case ProdosStorageType.VOLUME_DIRECTORY_HEADER:
        // +$00 / 1: storage type / name length ($Fx)
        // +$01 /15: volume name (A-Z, 0-9, '.', must start with letter)
        // +$10 / 2: (reserved, should be zeroes)
        // +$12 / 4: (undocumented? GS/OS feature) modification date/time
        // +$16 / 2: lower-case flags (see TN.GSOS.008)
        // +$18 / 4: creation date/time of this volume
        // +$1c / 2: version/min_version (min version must be 0 or GS/OS gets upset?)
        // +$1e / 1: access flags
        // +$1f / 1: directory entry length (usually $27)
        // +$20 / 1: entries per directory block (usually $200/$27 = $0d)
        // +$21 / 2: number of active entries in volume directory (not including header)
        // +$23 / 2: volume bitmap start block
        // +$25 / 2: total blocks in volume
        return new ProdosFile(this, {
          raw: entry,
          storageType,
          name,
          lowerCaseFlags: entry[0x16] + (entry[0x17] << 8),
          creationTime: this.parseTimestamp(entry.slice(0x18, 0x18 + 4)),
          version: entry[0x1c],
          minVersion: entry[0x1d],
          accessFlags: this.parseAccessFlags(entry[0x1e]),
          directoryEntryLength: entry[0x1f],
          entriesPerDirectoryBlock: entry[0x20],
          numActiveEntries: [0x21] + (entry[0x22] << 8),
          volumeBitmapStartBlock: entry[0x23] + (entry[0x24] << 8),
          volumeTotalBlocks: entry[0x25] + (entry[0x26] << 8),
        });
      default:
        console.log('unknown storage type:', storageType);
        return null;
    }
  }

  /**
   * read prodos 512 byte block
   * max 65536 blocks = 32MB
   * @param {number} block uint16
   * @returns {Uint8ClampedArray|null}
   */
  readBlock(block) {
    if (!this.data) return null;
    if (block < 0 || block > 65535) return null;

    console.log('read block ', block);
    const offset = block * PRODOS_BLOCK_SIZE;
    return this.data.slice(offset, offset + PRODOS_BLOCK_SIZE);
  }

  // TODO: parse prodos access flags
  parseAccessFlags(byte) {
    // D R B - - I W R
    // $80: destroy-enabled
    // $40: rename-enabled
    // $20: backup-needed
    // $10: (reserved)
    // $08: (reserved)
    // $04: file-invisible (GS/OS addition)
    // $02: write-enabled
    // $01: read-enabled
    return Number(byte).toString(2).padStart(8, '0');
  }

  // TODO: parse prodos timestamp
  parseTimestamp(bytes) {
    // YYYYYYY MMMM DDDDD 000 HHHHH 00 MMMMMM
    return (
      Number(bytes[0]).toString(2).padStart(8, '0') +
      Number(bytes[1]).toString(2).padStart(8, '0') +
      Number(bytes[2]).toString(2).padStart(8, '0') +
      Number(bytes[3]).toString(2).padStart(8, '0')
    );
  }
}

class ProdosFile {
  constructor(disk, attrs) {
    this.disk = disk;
    this.attrs = attrs;
  }

  get name() {
    return this.attrs.name;
  }

  get size() {
    return this.attrs.blocksUsed * PRODOS_BLOCK_SIZE;
  }

  get type() {
    return [this.attrs.storageType, this.attrs.fileType, this.attrs.auxType].join(':');
  }

  get flags() {
    return this.attrs.accessFlags;
  }

  get content() {
    // TODO:
    return '';
  }
}
