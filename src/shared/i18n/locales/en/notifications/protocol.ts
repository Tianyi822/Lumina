import type { Resources } from '../../zh'

const protocol: Resources['notifications']['protocol'] = {
  invalidProtocolUrl: 'Invalid protocol URL',
  invalidProtocolPath: 'Invalid protocol path',
  invalidResourceType: 'Invalid protocol resource type',
  invalidResourcePath: 'Invalid protocol resource path',
  writingRootOutOfBounds: 'Writing resource root is out of bounds',
  notPlainFile: 'Protocol resource is not a regular file',
  realPathOutOfBounds: 'Protocol resource real path is out of bounds',
  resourceUnreadable: 'Protocol resource does not exist or cannot be read safely',
  invalidWritingPath: 'Invalid writing resource path',
  invalidWritingType: 'Invalid writing resource type',
  writingPathOutOfBounds: 'Writing resource path is out of bounds',
  invalidPaperPath: 'Invalid paper resource path',
  paperPathOutOfBounds: 'Paper resource path is out of bounds',
  rootNotPlainDirectory: 'Resource root is not a regular directory'
}

export default protocol
