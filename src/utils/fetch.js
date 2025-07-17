const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function fetchProblemByName(slug) {
  const body = {
    query: `
      query getProblem($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          content
          sampleTestCase
        }
      }`,
    variables: { titleSlug: slug }
  };

  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
  const json = await res.json();
  console.log(json);
  if (!json.data || !json.data.question)
    throw new Error('Problem not found or API changed');
  return json.data.question;
}

// can merge problemById and problemByName (though it might increase few searches for problemByName, also not very clean)

async function fetchProblemById(slug) {
  console.log(typeof slug);
  const body = {
    operationName: "problemsetQuestionListV2",
    query: "\n    query problemsetQuestionListV2($limit: Int, $searchKeyword: String,  $skip: Int, $categorySlug: String) {\n  problemsetQuestionListV2( limit: $limit\n  searchKeyword: $searchKeyword\n skip: $skip\n   categorySlug: $categorySlug\n  ) {\n    questions {\n      id\n      titleSlug\n      title\n      translatedTitle\n      questionFrontendId\n      paidOnly\n      difficulty\n      topicTags {\n        name\n        slug\n        nameTranslated\n      }\n      status\n      isInMyFavorites\n      frequency\n      acRate\n      contestPoint\n    }\n    totalLength\n    finishedLength\n    hasMore\n  }\n}\n  ",
    variables: {
      skip: 0,
      limit: 10000,
      searchKeyword:slug,
      categorySlug: "all-code-essentials"
    }
  }
  const res = await fetch('https://leetcode.com/graphql/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  console.log(res);

  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
  const json = await res.json();
  console.log("my json: ",json);  
  questions = await json["data"]["problemsetQuestionListV2"]["questions"]
  console.log("all questions realted: ", questions);

  for (const q of questions) {
    console.log(`slug: ${slug} ${typeof slug}-----  id:${q.questionFrontendId}  ${typeof q.questionFrontendId} `)
    if (Number(q.questionFrontendId) === slug){
      console.log(q);
      return q.titleSlug;
    }
  }
  console.log("question not found\n");
  return null;
}



async function fetchOfficialSolutionPlayground(slug) {
  const body = {
    operationName: "ugcArticleOfficialSolutionArticle",
    query: "\n    query ugcArticleOfficialSolutionArticle($questionSlug: String!) {\n  ugcArticleOfficialSolutionArticle(questionSlug: $questionSlug) {\n    ...ugcSolutionArticleFragment\n    content\n    isSerialized\n    isAuthorArticleReviewer\n    scoreInfo {\n      scoreCoefficient\n    }\n  }\n}\n    \n    fragment ugcSolutionArticleFragment on SolutionArticleNode {\n  uuid\n  title\n  slug\n  summary\n  author {\n    realName\n    userAvatar\n    userSlug\n    userName\n    nameColor\n    certificationLevel\n    activeBadge {\n      icon\n      displayName\n    }\n  }\n  articleType\n  thumbnail\n  summary\n  createdAt\n  updatedAt\n  status\n  isLeetcode\n  canSee\n  canEdit\n  isMyFavorite\n  chargeType\n  myReactionType\n  topicId\n  hitCount\n  hasVideoArticle\n  reactions {\n    count\n    reactionType\n  }\n  title\n  slug\n  tags {\n    name\n    slug\n    tagType\n  }\n  topic {\n    id\n    topLevelCommentCount\n  }\n}\n",
    variables: { questionSlug: slug }
  }

  const res = await fetch('https://leetcode.com/graphql/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);

  const json = await res.json();
  const content = json?.data?.ugcArticleOfficialSolutionArticle?.content
  if (!content)
    return false;
  const regex = /src="https:\/\/leetcode\.com\/playground\/([a-zA-Z0-9\-]{8,})\/shared"/;
  if (!regex)
    return false;
  const uuidContent = content.match(regex);
  const playgroundUUID = uuidContent[1];
  return playgroundUUID;

}

async function fetchOfficialSolution(slug) {
  const playgroundUUID = await fetchOfficialSolutionPlayground(slug);

  if (!playgroundUUID)
    return false;
  const body = {
    operationName: "fetchPlayground",
    query: `
      query fetchPlayground($uuid: String!) {
        playground(uuid: $uuid) {
          testcaseInput
          name
          isUserOwner
          isLive
          showRunCode
          showOpenInPlayground
          selectedLangSlug
          isShared
          __typename
        }
        allPlaygroundCodes(uuid: $uuid) {
          code
          langSlug
          __typename
        }
      }
    `,
    variables: {
      uuid: playgroundUUID
    }
  };


  const res = await fetch('https://leetcode.com/graphql/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);

  const json = await res.json();

  const codeCPP = json.data.allPlaygroundCodes[0].code;
  const filePath = path.join(__dirname, '..', '..', 'stress tester', 'official.cpp');
  fs.writeFileSync(filePath, codeCPP);
  console.log('Leetcode: Saved to official.cpp');
  return true
}



async function fetchGithubSolution(slug) {
  const url = `https://raw.githubusercontent.com/kamyu104/LeetCode-Solutions/master/C++/${slug}.cpp`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Github returned ${res.status}`);

  const codeCPP = await res.text();
  const filePath = path.join(__dirname, '..', '..', 'stress tester', 'official.cpp');
  fs.writeFileSync(filePath, codeCPP);
  console.log('Saved to official.cpp');
  return true;

}


module.exports = { fetchProblemByName, fetchOfficialSolution, fetchGithubSolution, fetchProblemById };
