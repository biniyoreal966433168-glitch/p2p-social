/* =====================================================
   P2P OFFERS
===================================================== */

async function loadAvailableOffers(){

  const container =
    document.getElementById(
      "p2pOffersContainer"
    );

  try{

    let result =
      await supabaseClient
        .from("p2p_offers")
        .select("*")
        .limit(50);

    if(result.error){

      result =
        await supabaseClient
          .from("offers")
          .select("*")
          .limit(50);

    }

    if(result.error){

      renderNoOffers();

      return;

    }

    const offers =
      (result.data||[])
        .filter(
          isOfferAvailable
        );

    if(!offers.length){

      renderNoOffers();

      return;

    }

    await renderAvailableOffers(
      offers
    );

  }catch(error){

    console.error(error);

    renderNoOffers();

  }

}


function isOfferAvailable(
  offer
){

  if(!offer)return false;

  const status =
    String(
      offer.status??""
    )
    .toLowerCase()
    .trim();

  if([
    "closed",
    "cancelled",
    "canceled",
    "completed",
    "inactive",
    "disabled",
    "sold"
  ].includes(status)){

    return false;

  }

  if(
    offer.is_active===false ||
    offer.active===false
  ){

    return false;

  }

  const amountValue =
    getFirstValue(
      offer,
      [
        "available_amount",
        "available",
        "remaining_amount",
        "amount"
      ]
    );

  if(
    amountValue!==null &&
    amountValue!==""
  ){

    const amount =
      Number(amountValue);

    if(
      !Number.isNaN(amount) &&
      amount<=0
    ){

      return false;

    }

  }

  return true;

}


async function renderAvailableOffers(
  offers
){

  const container =
    document.getElementById(
      "p2pOffersContainer"
    );

  const userIds = [
    ...new Set(
      offers
        .map(
          offer =>
            offer.user_id||
            offer.seller_id||
            offer.owner_id||
            offer.created_by
        )
        .filter(Boolean)
    )
  ];

  let profiles=[];

  if(userIds.length){

    const result =
      await supabaseClient
        .from("profiles")
        .select(
          "id,username,avatar_url"
        )
        .in(
          "id",
          userIds
        );

    if(!result.error){

      profiles =
        result.data||[];

    }

  }

  const profileMap={};

  profiles.forEach(
    profile=>{

      profileMap[
        profile.id
      ]=profile;

    }
  );

  const sorted =
    [...offers].sort(
      (a,b)=>{

        const aPinned =
          Boolean(
            a.is_pinned||
            a.pinned
          );

        const bPinned =
          Boolean(
            b.is_pinned||
            b.pinned
          );

        return Number(bPinned)-
               Number(aPinned);

      }
    );

  container.innerHTML="";

  sorted
    .slice(
      0,
      AVAILABLE_OFFERS_LIMIT
    )
    .forEach(
      offer=>{

        container.appendChild(
          createOfferCard(
            offer,
            profileMap
          )
        );

      }
    );

}


function createOfferCard(
  offer,
  profileMap
){

  const card =
    document.createElement(
      "div"
    );

  card.className =
    "p2p-card";

  const userId =
    offer.user_id||
    offer.seller_id||
    offer.owner_id||
    offer.created_by||
    "";

  const profile =
    profileMap[userId]||{};

  const username =
    profile.username||
    offer.username||
    offer.seller_username||
    "Available trader";

  const avatarUrl =
    profile.avatar_url||
    offer.avatar_url||
    "";

  const initial =
    username
      .charAt(0)
      .toUpperCase()||
    "U";

  const typeRaw =
    getFirstValue(
      offer,
      [
        "type",
        "trade_type",
        "side",
        "offer_type"
      ]
    );

  const type =
    String(typeRaw||"buy")
      .toLowerCase();

  const rate =
    getFirstValue(
      offer,
      [
        "rate",
        "price",
        "exchange_rate",
        "price_per_usdt"
      ]
    );

  const amount =
    getFirstValue(
      offer,
      [
        "available_amount",
        "available",
        "remaining_amount",
        "amount"
      ]
    );

  const min =
    getFirstValue(
      offer,
      [
        "min_amount",
        "minimum_amount",
        "min"
      ]
    );

  const max =
    getFirstValue(
      offer,
      [
        "max_amount",
        "maximum_amount",
        "max"
      ]
    );

  const normalizedType =
    type.includes("sell")
      ?"sell"
      :"buy";

  const label =
    normalizedType==="sell"
      ?"SELL USDT"
      :"BUY USDT";

  const avatarHTML =
    avatarUrl
      ?
      `<div class="avatar">
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="Profile">
      </div>`
      :
      `<div class="avatar">
        ${escapeHtml(initial)}
      </div>`;

  const pinned =
    Boolean(
      offer.is_pinned||
      offer.pinned
    );

  card.innerHTML=`

    ${
      pinned
        ?
        `
        <div class="pin-label">
          📌 Pinned
        </div>
        `
        :""
    }

    <div class="offer-type">
      ${escapeHtml(label)}
    </div>

    <div class="p2p-card-header">

      <div class="seller">

        ${avatarHTML}

        <div>

          <div class="username">
            ${escapeHtml(username)}
          </div>

          <div class="online">
            ● Available
          </div>

        </div>

      </div>

      ${
        rate!==null &&
        rate!==""
        ?
        `
        <div class="rate">

          <strong>
            ${escapeHtml(
              formatNumber(rate)
            )} ETB
          </strong>

          <small>
            1 USDT
          </small>

        </div>
        `
        :""
      }

    </div>

    <div class="trade-info">

      ${
        amount!==null &&
        amount!==""
        ?
        `
        <span>
          Available:
          <strong>
            ${escapeHtml(
              formatNumber(amount)
            )} USDT
          </strong>
        </span>
        `
        :
        `<span>
          Available offer
        </span>`
      }

      ${
        min!==null &&
        min!==""
        ?
        `
        <span>
          Min:
          ${escapeHtml(
            formatNumber(min)
          )} ETB
        </span>
        `
        :""
      }

      ${
        max!==null &&
        max!==""
        ?
        `
        <span>
          Max:
          ${escapeHtml(
            formatNumber(max)
          )} ETB
        </span>
        `
        :""
      }

    </div>

    <button
      class="buy-btn"
      onclick="
        openP2POffer(
          '${escapeJs(offer.id)}'
        );
      ">

      ${
        normalizedType==="sell"
          ?"Buy USDT"
          :"View Offer"
      }

    </button>

  `;

  return card;

}


function renderNoOffers(){

  document.getElementById(
    "p2pOffersContainer"
  ).innerHTML=`

    <div class="no-offers">

      <div class="no-offers-icon">
        🔄
      </div>

      <strong>
        No available offers yet.
      </strong>

      <small>
        Available P2P offers will appear here
        when traders create them.
      </small>

    </div>

  `;

}


/* =====================================================
   POSTS
===================================================== */

/*
   KEEP THE REST OF THE JAVASCRIPT YOU SENT HERE:

   - loadPosts()
   - loadMorePosts()
   - renderPosts()
   - renderPostMedia()
   - likePost()
   - toggleComments()
   - refreshSinglePostComments()
   - renderComments()
   - addComment()
   - deleteComment()
   - openCreatePost()
   - closeCreatePost()
   - updateMediaControls()
   - previewMedia()
   - createPost()
   - deletePost()
   - sharePost()
   - loadNotifications()
   - renderNotifications()
   - notificationIcon()
   - markNotificationRead()
   - markAllNotificationsRead()
   - resetNotifications()
   - toggleNotificationPanel()
   - subscribeToNotifications()
   - showNewNotificationPopup()
   - getFirstValue()
   - formatNumber()
   - formatPostTime()
   - escapeHtml()
   - escapeJs()
   - modal handlers
   - ESC handler
   - startApp()
*/


/* =====================================================
   START APP
===================================================== */

startApp();