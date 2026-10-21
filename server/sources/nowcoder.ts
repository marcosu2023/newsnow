interface Res {
  data: {
    result: {
      id: string | number
      title: string
      type: number
      uuid: string
    }[]
  }
}

export default defineSource(async () => {
  const timestamp = Date.now()
  const url = `https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc?size=20&_=${timestamp}&t=`
  const res: Res = await myFetch(url)
  return res.data.result
    .flatMap((k) => {
      let url: string
      let id: string | number
      if (k.type === 74) {
        url = `https://www.nowcoder.com/feed/main/detail/${k.uuid}`
        id = k.uuid
      } else if (k.type === 0) {
        url = `https://www.nowcoder.com/discuss/${k.id}`
        id = k.id
      } else {
        return []
      }
      if (!(typeof id === "string" && id.trim()) && !(typeof id === "number" && Number.isFinite(id))) return []
      return [{
        id,
        title: k.title,
        url,
      }]
    })
})
