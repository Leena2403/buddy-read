export const USER_COLORS = {
  amber:   { bg: 'rgba(245,158,11,0.32)',  solid: '#F59E0B', light: '#FEF3C7', text: '#92400E', name: 'Amber' },
  violet:  { bg: 'rgba(139,92,246,0.25)',  solid: '#8B5CF6', light: '#EDE9FE', text: '#5B21B6', name: 'Violet' },
  emerald: { bg: 'rgba(16,185,129,0.25)',  solid: '#10B981', light: '#D1FAE5', text: '#064E3B', name: 'Emerald' },
  rose:    { bg: 'rgba(244,63,94,0.25)',   solid: '#F43F5E', light: '#FFE4E6', text: '#9F1239', name: 'Rose' },
  sky:     { bg: 'rgba(14,165,233,0.25)',  solid: '#0EA5E9', light: '#E0F2FE', text: '#0C4A6E', name: 'Sky' },
}
export const COLOR_OPTIONS = Object.entries(USER_COLORS).map(([id, v]) => ({ id, ...v }))

export function genId(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len)
}
export function genRoomCode() {
  const a = Math.random().toString(36).slice(2,5)
  const b = Math.floor(Math.random()*900+100)
  return `${a}-${b}`
}
export function timeAgo(iso) {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return Math.floor(d/60000)+'m ago'
  if (d < 86400000) return Math.floor(d/3600000)+'h ago'
  return new Date(iso).toLocaleDateString()
}
export function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
}

export const BOOKS = {
  pride: {
    id: 'pride', title: 'Pride and Prejudice', author: 'Jane Austen', year: 1813, emoji: '📖',
    paragraphs: [
      {id:'p0', type:'chapter', text:'Chapter I'},
      {id:'p1', type:'para', text:'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.'},
      {id:'p2', type:'para', text:'"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?" Mr. Bennet replied that he had not. "But it is," returned she; "for Mrs. Long has just been here, and she told me all about it." Mr. Bennet made no answer.'},
      {id:'p3', type:'para', text:'"Do not you want to know who has taken it?" cried his wife impatiently. "You want to tell me, and I have no objection to hearing it." This was invitation enough.'},
      {id:'p4', type:'para', text:'"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."'},
      {id:'p5', type:'para', text:'"What is his name?" "Bingley." "Is he married or single?" "Oh! Single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!"'},
      {id:'p6', type:'para', text:'"How so? Can it affect them?" "My dear Mr. Bennet," replied his wife, "how can you be so tiresome! You must know that I am thinking of his marrying one of them." "Is that his design in settling here?" "Design! Nonsense, how can you talk so! But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes."'},
      {id:'p7', type:'chapter', text:'Chapter II'},
      {id:'p8', type:'para', text:'Mr. Bennet was among the earliest of his neighbours in calling on Mr. Bingley. He had always meant to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid, she had no knowledge of it.'},
      {id:'p9', type:'para', text:'"I hope Mr. Bingley will like it, Lizzy." "We are not in a way to know what Mr. Bingley likes," said her mother resentfully, "since we are not to visit." "But you forget, mamma," said Elizabeth, "that we shall meet him at the assemblies, and that Mrs. Long has promised to introduce him."'},
      {id:'p10', type:'para', text:'"I do not believe Mrs. Long will do any such thing. She has two nieces of her own. She is a selfish, hypocritical woman, and I have no opinion of her." "No more have I," said Mr. Bennet; "and I am glad to find that you do not depend on her serving you."'},
      {id:'p11', type:'para', text:'"Stop your coughing so, Kitty, for heaven\'s sake! Have a little compassion on my nerves. You tear them to pieces." "Kitty has no discretion in her coughs," said her father; "she times them ill." "I do not cough for my own amusement," replied Kitty fretfully.'},
      {id:'p12', type:'chapter', text:'Chapter III'},
      {id:'p13', type:'para', text:'Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject was sufficient to draw from her husband any satisfactory description of Mr. Bingley. They attacked him in various ways; with barefaced questions, ingenious suppositions, and distant surmises; but he eluded the skill of them all.'},
      {id:'p14', type:'para', text:'Her report was highly favourable. Sir William had been delighted with him. He was quite young, wonderfully handsome, extremely agreeable, and to crown the whole, he meant to be at the next assembly with a large party. Nothing could be more delightful! To be fond of dancing was a certain step towards falling in love.'},
      {id:'p15', type:'para', text:'"If I can but see one of my daughters happily settled at Netherfield," said Mrs. Bennet to her husband, "and all the others equally well married, I shall have nothing to wish for." In a few days Mr. Bingley returned Mr. Bennet\'s visit, and sat about ten minutes with him in his library.'},
    ]
  },
  gatsby: {
    id:'gatsby', title:'The Great Gatsby', author:'F. Scott Fitzgerald', year:1925, emoji:'🥂',
    paragraphs:[
      {id:'p0',type:'chapter',text:'Chapter I'},
      {id:'p1',type:'para',text:'In my younger and more vulnerable years my father gave me some advice that I\'ve been turning over in my mind ever since. "Whenever you feel like criticizing anyone," he told me, "just remember that all the people in this world haven\'t had the advantages that you\'ve had."'},
      {id:'p2',type:'para',text:'He didn\'t say any more, but we\'ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I\'m inclined to reserve all judgments, a habit that has opened up many curious natures to me.'},
      {id:'p3',type:'para',text:'And, after boasting this way of my tolerance, I come to the admission that it has a limit. Conduct may be founded on the hard rock or the wet marshes, but after a certain point I don\'t care what it\'s founded on. When I came back from the East last autumn I felt that I wanted the world to be in uniform and at a sort of moral attention forever.'},
      {id:'p4',type:'para',text:'Only Gatsby, the man who gives his name to this book, was exempt from my reaction — Gatsby, who represented everything for which I have an unaffected scorn. If personality is an unbroken series of successful gestures, then there was something gorgeous about him, some heightened sensitivity to the promises of life.'},
      {id:'p5',type:'para',text:'This responsiveness had nothing to do with that flabby impressionability which is dignified under the name of the "creative temperament" — it was an extraordinary gift for hope, a romantic readiness such as I have never found in any other person and which it is not likely I shall ever find again.'},
    ]
  },
  metamorphosis: {
    id:'metamorphosis', title:'The Metamorphosis', author:'Franz Kafka', year:1915, emoji:'🪲',
    paragraphs:[
      {id:'p0',type:'chapter',text:'Part I'},
      {id:'p1',type:'para',text:'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections.'},
      {id:'p2',type:'para',text:'His many legs, pitifully thin compared with the size of the rest of him, were waving helplessly before his eyes. "What\'s happened to me?" he thought. It wasn\'t a dream. His room, a proper human room although a little too small, lay peacefully between its four familiar walls.'},
      {id:'p3',type:'para',text:'A collection of textile samples lay spread out on the table — Samsa was a travelling salesman — and above it there hung a picture that he had recently cut out of an illustrated magazine and housed in a nice, gilded frame. It showed a lady fitted out with a fur hat and fur boa.'},
      {id:'p4',type:'para',text:'Gregor then turned to look out the window at the dull weather. Drops of rain could be heard hitting the pane, which made him feel quite sad. "How about if I sleep a little bit longer and forget all this nonsense," he thought, but that was something he was unable to do.'},
    ]
  }
}
export const BOOK_LIST = Object.values(BOOKS)
