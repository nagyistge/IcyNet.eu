import API from './index'
import Models from './models'

const perPage = 8

function slugify (title) {
  return title.toLowerCase().replace(/\W/g, '-').substring(0, 16)
}

async function cleanArticle (entry, shortenContent = false) {
  let poster = await API.User.get(entry.user_id)
  let article = {
    id: entry.id,
    slug: slugify(entry.title),
    title: entry.title,
    content: entry.content,
    tags: entry.tags.split(','),
    created_at: entry.created_at,
    updated_at: entry.updated_at
  }

  if (poster) {
    article.author = {
      id: poster.id,
      display_name: poster.display_name
    }
  }

  if (shortenContent) {
    article.content = article.content.replace(/(<([^>]+)>)/ig, '').substring(0, 128) + '...'
  }

  return article
}

const News = {
  preview: async () => {
    // Fetch 3 latest stories
    let news = await Models.News.query().orderBy('created_at', 'desc').limit(3)

    if (!news.length) return []

    let articles = []
    for (let i in news) {
      let entry = news[i]
      articles.push(await cleanArticle(entry, true))
    }

    return articles
  },
  listNews: async (page) => {
    let count = await Models.News.query().count('id as ids')
    if (page < 1) page = 1

    if (!count.length || !count[0]['ids'] || isNaN(page)) {
      return {error: 'No articles found'}
    }

    count = count[0].ids
    let paginated = API.Pagination(perPage, parseInt(count), page)
    let news = await Models.News.query().orderBy('created_at', 'desc').offset(paginated.offset).limit(perPage)

    let articles = []
    for (let i in news) {
      let entry = news[i]

      articles.push(await cleanArticle(entry))
    }

    return {
      page: paginated,
      articles: articles
    }
  },
  article: async (id) => {
    let article = await Models.News.query().where('id', id)
    if (!article.length) return {}
    article = article[0]

    return cleanArticle(article)
  }
}

module.exports = News
