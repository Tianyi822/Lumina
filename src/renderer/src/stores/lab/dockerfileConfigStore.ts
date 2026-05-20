import { create } from 'zustand'

interface DockerfileConfigState {
  dockerfileContent: string
  dockerfileContext: string
  dockerfileProjectName: string
  selectedDockerfileId: string | null
  reset: () => void
}

export const useDockerfileConfigStore = create<DockerfileConfigState>()((set) => ({
  dockerfileContent: '',
  dockerfileContext: '',
  dockerfileProjectName: '',
  selectedDockerfileId: null,

  reset: () =>
    set({
      dockerfileContent: '',
      dockerfileContext: '',
      dockerfileProjectName: '',
      selectedDockerfileId: null
    })
}))
